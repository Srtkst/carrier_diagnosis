/**
 * @file script.js
 * @description モバイルキャリア診断システムのフロントエンド制御・UI制御・診断アルゴリズムの実装
 * 
 * 【主な役割・機能】
 * 1. データの読み込み (loadData)
 *    - 各種JSONデータ（質問、プラン、割引、端末情報）を非同期でフェッチし、システムを初期化します。
 * 2. 状態管理 (State Management)
 *    - ユーザーの現在の進捗状況、選択された回答、アクティブな質問リストなどを管理します。
 * 3. 画面遷移とUI制御 (UI Control)
 *    - 「開始画面」「キャリア一覧画面」「質問回答画面」「結果表示画面」「機種推奨画面」の動的な切り替え。
 * 4. 診断・ロジック計算 (Diagnostic Algorithm)
 *    - 回答データを元に通信データ量(GB)を割り出し、各キャリアの最適な料金プランと割引を適用し計算。
 *    - 「料金重視」「品質重視」「サービス重視」の観点から最適キャリアを判定。
 * 5. 機種推奨と買い替えシミュレーション (Device Recommendation)
 *    - 機種変更ニーズに合わせた最適端末の選定、他社乗換(MNP)と自社継続の価格比較シミュレーション。
 * 6. 結果保存・証明書出力 (Certificate Capture)
 *    - `html2canvas` ライブラリを使用して、診断結果を画像として保存・ダウンロードする機能。
 * 7. デバッグ用ツール (Crew Debug)
 *    - 内部ロジックの評価値や計算経過をリアルタイムに確認・表示するデバッグ用モーダル。
 * 
 * 【データ連携・ファイル依存】
 * - data/question.json : 質問データと設問分岐の定義
 * - data/plans.json    : 各キャリアの料金プランとデータ区分（ティア/フラット）
 * - data/rules.json    : 各キャリアの家族割、光回線割、カード割引などの計算ロジック
 * - data/devices.json  : 推奨端末のスペックや特徴データ
 * - css/style.css      : 画面装飾、デバイス最適化（タブレット・モバイル向け）、アニメーション
 * 
 * 【主要な処理フロー】
 * DOMContentLoaded (初期化) ➔ loadData (データ読込) ➔ 開始画面表示 ➔ 質問回答 (selectOption / branching) ➔ 結果計算 (showResult)
 */

document.addEventListener('DOMContentLoaded', () => {
    // 状態管理
    let questions = [];
    let plansData = {};
    let rulesData = {};
    let devicesData = {};
    let currentQuestionIndex = 0;
    let answers = {};
    let activeQuestionIds = [];
    let lastRecs = null;
    let crewDebugData = {};

    // UI要素の取得
    const startScreen = document.getElementById('start-screen');
    const carrierListScreen = document.getElementById('carrier-list-screen');
    const questionContainer = document.getElementById('question-container');
    const resultScreen = document.getElementById('result-screen');
    const deviceResultScreen = document.getElementById('device-result-screen');
    
    const startBtn = document.getElementById('start-btn');
    const showListBtn = document.getElementById('show-list-btn');
    const backFromListBtn = document.getElementById('back-from-list');
    const homeBtn = document.getElementById('home-btn');
    const carrierListContainer = document.getElementById('carrier-list-container');
    
    const prevBtn = document.getElementById('prev-btn');
    const progressFill = document.getElementById('progress');
    const questionTitle = document.getElementById('question-title');
    const optionsContainer = document.getElementById('options-container');

    const genCertBtn = document.getElementById('gen-cert-btn');
    const genCertBtnDevice = document.getElementById('gen-cert-btn-device');
    const captureModal = document.getElementById('capture-modal');
    const closeModal = document.getElementById('close-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const certResults = document.getElementById('cert-results');
    const certDate = document.getElementById('cert-date');
    const certUserName = document.getElementById('cert-user-name');
    const downloadImgBtn = document.getElementById('download-img-btn');

    const crewDebugBtn = document.getElementById('crew-debug-btn');
    const crewDebugTrigger = document.getElementById('crew-debug-trigger');
    const crewModal = document.getElementById('crew-modal');
    const crewDebugContent = document.getElementById('crew-debug-content');

    const answerSummary = document.getElementById('answer-summary');
    const certAnswers = document.getElementById('cert-answers');

    // 全画面表示トグル
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    if (fullscreenBtn) {
        // 全画面表示の切り替え
        fullscreenBtn.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(err => {
                    console.error(`全画面表示エラー: ${err.message}`);
                });
                fullscreenBtn.textContent = '元に戻す';
            } else {
                document.exitFullscreen();
                fullscreenBtn.textContent = '全画面';
            }
        });
    }

    // データ読み込み
    async function loadData() {
        try {
            // データの読み込み開始
            console.log('データを読み込み中...');

            // 複数のJSONファイルを同時にフェッチ
            const [qRes, pRes, rRes, dRes] = await Promise.all([
                fetch('data/question.json'),
                fetch('data/plans.json'),
                fetch('data/rules.json'),
                fetch('data/devices.json')
            ]);

            // すべてのレスポンスが正常かどうかをチェック
            if (!qRes.ok || !pRes.ok || !rRes.ok || !dRes.ok) {
                throw new Error('一部のデータファイルの読み込みに失敗しました。');
            }

            // JSONデータをパース
            questions = (await qRes.json()).questions;
            plansData = await pRes.json();
            rulesData = await rRes.json();
            devicesData = await dRes.json();
            
            // データの読み込み完了をログに出力
            console.log('データ読み込み完了:', { questions, plansData, rulesData, devicesData });
            generateCarrierList();
        } catch (error) {
            // エラーが発生した場合の処理
            console.error('データの読み込みに失敗しました:', error);
            alert('システムの初期化に失敗しました。ページを再読み込みしてください。');
        }
    }

    function generateCarrierList() {
        // キャリアリストの生成
        if (!carrierListContainer) return;
        carrierListContainer.innerHTML = '';
        
        // キャリアごとのプランと割引情報を表示
        for (const [key, plans] of Object.entries(plansData)) {
            // キャリアごとのリストアイテムを作成
            const item = document.createElement('div');
            item.className = `list-item carrier-${key} fade-in`;
            
            // プラン情報のHTML生成
            let planHtml = '';
            for (const [pName, pInfo] of Object.entries(plans)) {
                // 最大価格を取得（ティアがある場合は最後のティアの価格を使用）
                const price = pInfo.tiers ? pInfo.tiers[pInfo.tiers.length - 1].price : pInfo.price;
                
                // プラン名と価格を表示
                planHtml += `
                    <div class="price-item">
                        <span class="price-label">${pName}</span>
                        <span class="price-value">${(price || 0).toLocaleString()}円${pInfo.tiers ? '〜' : ''}</span>
                    </div>`;
            }

            // 適用可能な割引情報のHTML生成
            let discountHtml = '<ul>';
            const rules = rulesData[key];
            if (rules) {
                // 割引ルールの名前をリストとして表示
                for (const r of Object.values(rules)) {
                    if (r && r.name) discountHtml += `<li>${r.name}</li>`;
                }
            }
            discountHtml += '</ul>';

            // キャリアリストアイテムの内容を設定
            item.innerHTML = `
                <h3>${getDisplayName(key)}</h3>
                <div class="list-item-content">
                    <div class="price-section"><h4>💰 基本料金（最大）</h4>${planHtml}</div>
                    <div class="discount-tag-list"><h4>✨ 適用可能な割引</h4>${discountHtml}</div>
                </div>
            `;
            // キャリアリストコンテナにアイテムを追加
            carrierListContainer.appendChild(item);
        }
    }

    // イベントリスナーの登録
    startBtn.addEventListener('click', () => {
        // 質問データが読み込まれていない場合の警告
        if (questions.length === 0) {
            alert('データの準備ができていません。しばらくお待ちください。');
            return;
        }

        // 診断開始時の初期化
        startScreen.classList.add('hidden');
        questionContainer.classList.remove('hidden');
        updateActiveQuestions();
        showQuestion();
    });

    // キャリアリスト表示ボタンのイベントリスナー
    showListBtn.addEventListener('click', () => {
        startScreen.classList.add('hidden');
        carrierListScreen.classList.remove('hidden');
    });

    // キャリアリストから戻るボタンのイベントリスナー
    backFromListBtn.addEventListener('click', () => {
        carrierListScreen.classList.add('hidden');
        startScreen.classList.remove('hidden');
    });

    // ホームボタンのイベントリスナー
    homeBtn.addEventListener('click', () => {
        if (confirm('診断を中止して最初に戻りますか？')) location.reload();
    });

    // 乗組員デバッグモーダルの表示
    if (crewDebugBtn) {
        // 乗組員デバッグボタンのイベントリスナー
        crewDebugBtn.addEventListener('click', () => {
            // デバッグ情報をレンダリングしてモーダルを表示
            renderCrewDebug();
            crewModal.classList.remove('hidden');
        });
    }

    // 乗組員デバッグトリガーのイベントリスナー
    if (crewDebugTrigger) {
        // 乗組員デバッグトリガーのクリックイベントでデバッグ情報を表示
        crewDebugTrigger.addEventListener('click', () => {
            // デバッグ情報をレンダリングしてモーダルを表示
            renderCrewDebug();
            crewModal.classList.remove('hidden');
        });
    }

    // 乗組員デバッグモーダルを閉じるボタンのイベントリスナー
    const closeCrewModal = document.getElementById('close-crew-modal');
    if (closeCrewModal) {
        // 乗組員デバッグモーダルを閉じるボタンのクリックイベントでモーダルを非表示にする
        closeCrewModal.onclick = () => crewModal.classList.add('hidden');
    }

    // 乗組員デバッグ情報をレンダリングする関数
    function renderCrewDebug() {
        // デバッグ情報のコンテンツをクリア
        crewDebugContent.innerHTML = '';
        if (Object.keys(crewDebugData).length === 0) {
            crewDebugContent.innerHTML = '<p style="color:white;">診断を完了させると計算詳細が表示されます。</p>';
            return;
        }

        // 各キャリアのデバッグ情報を表示
        for (const [carrierKey, data] of Object.entries(crewDebugData)) {
            // キャリアごとのブロックを作成
            const block = document.createElement('div');
            block.className = 'crew-carrier-block';
            let discountsHtml = data.appliedDiscounts.map(d => `<div class="crew-discount-item">・${d.name}: -${d.value.toLocaleString()}円</div>`).join('');

            // キャリアごとのデバッグ情報のHTMLを設定
            block.innerHTML = `
                <div class="crew-carrier-title">${getDisplayName(carrierKey)}</div>
                <div class="crew-calc-row"><span>プラン:</span> <span>${data.planName}</span></div>
                <div class="crew-calc-row"><span>基本:</span> <span>${data.basePrice.toLocaleString()}円</span></div>
                <div class="crew-discount-list"><strong>適用施策:</strong>${discountsHtml || '<div>なし</div>'}</div>
                <div class="crew-calc-row" style="margin-top:10px; font-weight:900; color:#ff7675;">
                    <span>実質:</span> <span>${data.finalFee.toLocaleString()}円</span>
                </div>
            `;
            crewDebugContent.appendChild(block);
        }
    }

    // 質問を表示する関数
    function showQuestion() {
        // 現在の質問IDを取得
        const currentId = activeQuestionIds[currentQuestionIndex];
        const question = questions.find(q => q.id === currentId);

        // 質問が見つからない場合のエラーハンドリング
        if (!question) {
            console.error('質問が見つかりません:', currentId);
            return;
        }

        // 質問タイトルを設定（新規契約の場合は特別なタイトルを使用）
        questionTitle.textContent = (answers.contractType === '新規' && question.titleForNew) ? question.titleForNew : question.title;
        optionsContainer.innerHTML = '';

        // 質問のタイプに応じて入力フィールドまたは選択肢を生成
        if (question.type === 'text') {
            // テキスト入力用のラッパーを作成
            const wrapper = document.createElement('div');
            wrapper.className = 'text-input-wrapper';
            
            // テキスト入力フィールドを作成
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'option-btn';
            input.placeholder = question.placeholder || '';
            input.value = answers[question.id] || '';
            input.style.width = '100%';
            input.style.textAlign = 'center';
            
            // 次へボタンを作成
            const next = document.createElement('button');
            next.className = 'btn btn-primary';
            next.style.marginTop = '30px';
            next.textContent = '次へ';
            next.onclick = () => selectOption(question.id, input.value || 'お客様');
            
            // 入力フィールドと次へボタンをラッパーに追加
            wrapper.appendChild(input);
            wrapper.appendChild(next);
            optionsContainer.appendChild(wrapper);
        } else {
            (question.options || []).forEach(option => {
                const btn = document.createElement('button');
                btn.className = `option-btn ${answers[question.id] === option ? 'selected' : ''}`;
                btn.textContent = getDisplayName(option);
                btn.onclick = () => selectOption(question.id, option);
                optionsContainer.appendChild(btn);
            });
        }

        const progress = ((currentQuestionIndex + 1) / activeQuestionIds.length) * 100;
        progressFill.style.width = `${progress}%`;
        prevBtn.style.display = currentQuestionIndex === 0 ? 'none' : 'inline-block';
    }

    function selectOption(questionId, option) {
        answers[questionId] = option;
        updateActiveQuestions();
        if (currentQuestionIndex < activeQuestionIds.length - 1) {
            currentQuestionIndex++;
            showQuestion();
        } else {
            showResult();
        }
    }

    prevBtn.onclick = () => {
        if (currentQuestionIndex > 0) {
            currentQuestionIndex--;
            showQuestion();
        }
    };

    function updateActiveQuestions() {
        activeQuestionIds = [];
        questions.forEach(q => {
            if (!q.showIf) {
                activeQuestionIds.push(q.id);
            } else {
                let shouldShow = true;
                for (const [key, values] of Object.entries(q.showIf)) {
                    if (!values.includes(answers[key])) {
                        shouldShow = false;
                        break;
                    }
                }
                if (shouldShow) activeQuestionIds.push(q.id);
            }
        });
    }

    function showResult() {
        questionContainer.classList.add('hidden');
        if (answers.contractType === '機種変更' || answers.contractType === '機種変更＋MNP') {
            showDeviceResult();
        } else {
            showNormalResult();
        }
    }

    function showNormalResult() {
        resultScreen.classList.remove('hidden');
        const results = calculateAllPlans();
        lastRecs = {
            price: getBest('price', results),
            quality: getBest('quality', results),
            service: getBest('service', results)
        };

        renderCarrierResult('result-price', lastRecs.price);
        renderCarrierResult('result-quality', lastRecs.quality);
        renderCarrierResult('result-service', lastRecs.service);

        const upgradeContainer = document.getElementById('upgrade-suggestions-container');
        if (answers.contractType === 'MNP') {
            renderUpgradeSuggestions(calculateUpgradeSuggestions());
        } else {
            upgradeContainer.classList.add('hidden');
        }

        renderAnswerSummary(answerSummary, 'summary-item');
    }

    function showDeviceResult() {
        deviceResultScreen.classList.remove('hidden');
        const device = devicesData[answers.devicePreference] || { name: '推奨機種なし', features: [], carriers: [] };
        
        document.getElementById('recommended-device-name').textContent = device.name;
        const featuresList = document.getElementById('device-features-list');
        featuresList.innerHTML = device.features.map(f => `<li>${f}</li>`).join('');

        const results = calculateAllPlans();
        const carrierList = document.getElementById('device-carrier-list');
        carrierList.innerHTML = '';

        Object.entries(results).forEach(([key, plan]) => {
            const isAvail = device.carriers.includes(key);
            const card = document.createElement('div');
            card.className = `device-carrier-card ${isAvail ? '' : 'unavailable'}`;
            card.innerHTML = `
                <div class="dev-carrier-name">${getDisplayName(key)}</div>
                <div class="dev-plan-name">${plan.name}</div>
                <div class="dev-fee">月額 ${plan.fee.toLocaleString()}円〜</div>
                ${isAvail ? '' : '<div style="color:#e66767; font-weight:700; margin-top:5px;">※この機種の取扱なし</div>'}
            `;
            carrierList.appendChild(card);
        });

        lastRecs = { device: device.name, results };
    }

    function calculateAllPlans() {
        const results = {};
        const userGB = getGBValue(answers.monthlyData);
        const currentUserGrade = rulesData.grades ? (rulesData.grades[answers.currentCarrier] || 0) : 0;

        for (const [carrierKey, plans] of Object.entries(plansData)) {
            const targetGrade = rulesData.grades ? (rulesData.grades[carrierKey] || 0) : 0;
            if (answers.contractType !== '新規' && targetGrade < currentUserGrade) continue;
            if (answers.contractType === '機種変更' && carrierKey !== answers.currentCarrier) continue;

            const best = calculateBestPlan(carrierKey, plans, userGB);
            if (best) results[carrierKey] = best;
        }
        return results;
    }

    function calculateUpgradeSuggestions() {
        const suggestions = {};
        const userGB = getGBValue(answers.monthlyData);
        const currentUserGrade = rulesData.grades ? (rulesData.grades[answers.currentCarrier] || 0) : 0;
        
        let currentGroupKey = null;
        if (rulesData.groups) {
            for (const [gk, members] of Object.entries(rulesData.groups)) {
                if (members.includes(answers.currentCarrier)) { currentGroupKey = gk; break; }
            }
        }

        if (currentGroupKey && rulesData.groups[currentGroupKey]) {
            rulesData.groups[currentGroupKey].forEach(ck => {
                if (ck === answers.currentCarrier) return;
                const targetGrade = rulesData.grades ? (rulesData.grades[ck] || 0) : 0;
                if (targetGrade > currentUserGrade) {
                    const plan = calculateBestPlan(ck, plansData[ck], userGB);
                    if (plan) suggestions[ck] = plan;
                }
            });
        }
        return suggestions;
    }

    function calculateBestPlan(carrierKey, plans, userGB) {
        let bestPlan = null;
        let bestDetails = null;

        for (const [pName, pInfo] of Object.entries(plans)) {
            const maxData = pInfo.data || (pInfo.tiers ? pInfo.tiers[pInfo.tiers.length - 1].upTo : 0);
            if (userGB > maxData) continue;

            const basePrice = pInfo.tiers ? (pInfo.tiers.find(t => userGB <= t.upTo)?.price || Infinity) : pInfo.price;
            if (basePrice === Infinity) continue;

            let totalDiscount = 0;
            let applied = [];
            const rules = rulesData[carrierKey];
            if (rules && pInfo.discountEligibility) {
                pInfo.discountEligibility.forEach(dType => {
                    const rule = rules[dType];
                    if (!rule) return;
                    let val = 0;
                    if (dType === 'family') {
                        const ua = answers.familyLines;
                        if (rule.values) {
                            val = rule.values[ua] ?? (['3回線','4回線','5回線以上'].includes(ua) ? rule.values['3回線以上'] : (['2回線','3回線','4回線','5回線以上'].includes(ua) ? rule.values['2回線以上'] : 0)) ?? 0;
                        } else { val = rule.value || 0; }
                    } else if (dType === 'fixedLine') {
                        if (rule.requires?.includes(answers.homeInternet)) val = rule.value || 0;
                    } else if (dType === 'card') {
                        const card = answers.creditCard;
                        if ((carrierKey === 'docomo' && card === 'dカード') ||
                            (['au','UQ_mobile'].includes(carrierKey) && card === 'au PAYカード') ||
                            (['SoftBank','Ymobile'].includes(carrierKey) && card?.includes('PayPayカード'))) val = rule.value || 0;
                    }
                    if (val > 0) { totalDiscount += val; applied.push({ name: rule.name, value: val }); }
                });
            }

            const finalFee = basePrice - totalDiscount;
            const score = finalFee - (userGB >= 30 && pInfo.type === 'unlimited' ? 500 : 0);

            if (!bestPlan || score < bestPlan.score) {
                bestPlan = { name: pName, fee: finalFee, score, features: pInfo.features || [] };
                bestDetails = { planName: pName, basePrice, appliedDiscounts: applied, finalFee };
            }
        }
        if (bestDetails) crewDebugData[carrierKey] = bestDetails;
        return bestPlan;
    }

    function renderUpgradeSuggestions(suggestions) {
        const container = document.getElementById('upgrade-suggestions-container');
        container.innerHTML = '';
        const keys = Object.keys(suggestions);
        if (keys.length === 0) { container.classList.add('hidden'); return; }

        container.classList.remove('hidden');
        container.innerHTML = '<h3 style="margin-bottom:20px;">💡 同一グループ内でのアップグレード提案</h3>';
        keys.forEach(k => {
            const res = suggestions[k];
            const div = document.createElement('div');
            div.className = 'upgrade-card fade-in';
            
            let extraInfo = '手続きが簡単で、サービス品質を向上できます。';
            if (answers.currentCarrier === 'UQ_mobile' && k === 'au') {
                extraInfo = '「auマネ活プラン」や「無制限使い放題」が選べるようになり、最新iPhoneの購入サポートも手厚くなります。';
            } else if (answers.currentCarrier === 'Ymobile' && k === 'SoftBank') {
                extraInfo = '「ペイトク」での還元や、Yahoo!ショッピング等の特典がさらに強力になります。データ無制限も選択可能です。';
            } else if (answers.currentCarrier === 'ahamo' && k === 'docomo') {
                extraInfo = 'ドコモショップでのフルサポートが受けられ、ファミリー割引の回線数カウント対象にもなります。';
            }

            div.innerHTML = `
                <div class="upgrade-info">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <strong style="font-size:1.6rem;">${getDisplayName(k)} (${res.name})</strong>
                        <span style="background:var(--primary-grad); color:white; padding:4px 12px; border-radius:20px; font-size:0.8rem; font-weight:900;">オススメ</span>
                    </div>
                    <p style="font-size:1.1rem; color:var(--text-main); font-weight:700; margin-bottom:8px;">月額目安: ${res.fee.toLocaleString()}円〜</p>
                    <span style="font-size:0.95rem; color:var(--text-sub); line-height:1.5; display:block;">${extraInfo}</span>
                </div>
            `;
            container.appendChild(div);
        });
    }

    function renderAnswerSummary(container, itemClass) {
        if (!container) return;
        container.innerHTML = '';
        activeQuestionIds.forEach(id => {
            if (id === 'userName') return;
            const q = questions.find(question => question.id === id);
            const val = answers[id];
            if (!val || !q) return;

            const label = q.title.split('を選択')[0].split('を入力')[0];
            const item = document.createElement('div');
            if (itemClass === 'summary-item') {
                item.className = itemClass;
                item.innerHTML = `<div class="summary-label">${label}</div><div class="summary-value">${getDisplayName(val)}</div>`;
            } else {
                item.className = 'cert-ans-item';
                item.innerHTML = `<span class="cert-ans-label">${label}</span><span class="cert-ans-value">${getDisplayName(val)}</span>`;
            }
            container.appendChild(item);
        });
    }

    function getGBValue(ans) {
        return { '1GB未満': 0.5, '1～3GB': 3, '3～10GB': 10, '10～20GB': 20, '20～30GB': 30, '30GB以上': 100 }[ans] || 5;
    }

    function getBest(category, results) {
        const cats = { price: ['Ymobile', 'UQ_mobile', 'ahamo'], quality: ['docomo', 'au', 'SoftBank'], service: ['SoftBank', 'au', 'docomo'] };
        let best = null;
        (cats[category] || Object.keys(results)).forEach(k => {
            const res = results[k];
            if (res && (!best || res.fee < best.fee)) best = { ...res, carrier: k };
        });
        return best;
    }

    function getDisplayName(name) {
        return { 'Ymobile': 'Y!mobile', 'UQ_mobile': 'UQ mobile' }[name] || name;
    }

    function renderCarrierResult(elementId, result) {
        const container = document.getElementById(elementId);
        if (!container) return;
        
        // 既存の見積もり表示があれば削除
        const oldFee = container.querySelector('.fee-estimate-v2');
        if (oldFee) oldFee.remove();

        if (!result) {
            container.querySelector('.carrier-name').textContent = '該当なし';
            return;
        }
        container.querySelector('.carrier-name').textContent = getDisplayName(result.carrier);
        const list = container.querySelector('.features');
        list.innerHTML = '';
        const fee = document.createElement('div');
        fee.className = 'fee-estimate-v2';
        fee.innerHTML = `<span class="fee-label">実質目安</span>月額 ${result.fee.toLocaleString()}円〜<br><span style="font-size:0.9rem; color:#636e72;">(${result.name})</span>`;
        container.insertBefore(fee, list);
    }

    function openCert() {
        if (!lastRecs) return;
        certUserName.textContent = answers.userName || 'お客様';
        certDate.textContent = new Date().toLocaleDateString();
        
        if (lastRecs.device) {
            certResults.innerHTML = `<h3>推奨機種: ${lastRecs.device}</h3><p>詳細は店頭スタッフまでお問い合わせください。</p>`;
        } else {
            certResults.innerHTML = ['price', 'quality', 'service'].map(k => `
                <div class="cert-item">
                    <div class="cert-item-cat">${k === 'price' ? '💰 料金' : (k === 'quality' ? '🚀 品質' : '🎁 サービス')}</div>
                    <div class="cert-item-main">
                        <div class="cert-carrier">${getDisplayName(lastRecs[k]?.carrier)}</div>
                        <div class="cert-fee">約${(lastRecs[k]?.fee || 0).toLocaleString()}円〜</div>
                    </div>
                </div>
            `).join('');
        }
        renderAnswerSummary(certAnswers, 'cert-ans-item');
        captureModal.classList.remove('hidden');
    }

    genCertBtn.onclick = openCert;
    genCertBtnDevice.onclick = openCert;
    closeModal.onclick = () => captureModal.classList.add('hidden');
    if (closeModalBtn) closeModalBtn.onclick = () => captureModal.classList.add('hidden');
    downloadImgBtn.onclick = () => {
        const target = document.getElementById('certificate-target');
        if (target) html2canvas(target).then(canvas => {
            const link = document.createElement('a');
            link.download = `キャリア診断書_${new Date().toLocaleDateString()}.png`;
            link.href = canvas.toDataURL();
            link.click();
        });
    };

    loadData();
});
