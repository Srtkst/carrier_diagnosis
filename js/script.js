document.addEventListener('DOMContentLoaded', () => {
    let questions = [];
    let plansData = {};
    let rulesData = {};
    let currentQuestionIndex = 0;
    let answers = {};
    let activeQuestionIds = [];

    const startScreen = document.getElementById('start-screen');
    const carrierListScreen = document.getElementById('carrier-list-screen');
    const questionContainer = document.getElementById('question-container');
    const resultScreen = document.getElementById('result-screen');
    
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
    const captureModal = document.getElementById('capture-modal');
    const closeModal = document.getElementById('close-modal');
    const certResults = document.getElementById('cert-results');
    const certDate = document.getElementById('cert-date');
    const certUserName = document.getElementById('cert-user-name');
    const downloadImgBtn = document.getElementById('download-img-btn');

    // Fullscreen Toggle
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    fullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.error(`全画面表示の有効化に失敗しました: ${err.message}`);
            });
            fullscreenBtn.textContent = '📺 元に戻す';
        } else {
            document.exitFullscreen();
            fullscreenBtn.textContent = '📺 全画面';
        }
    });

    const answerSummary = document.getElementById('answer-summary');
    const certAnswers = document.getElementById('cert-answers');

    let lastRecs = null;

    // データ読み込み
    async function loadData() {
        try {
            const [qRes, pRes, rRes] = await Promise.all([
                fetch('data/question.json'),
                fetch('data/plans.json'),
                fetch('data/rules.json')
            ]);
            questions = (await qRes.json()).questions;
            plansData = await pRes.json();
            rulesData = await rRes.json();
            
            generateCarrierList();
        } catch (error) {
            console.error('データの読み込みに失敗しました:', error);
        }
    }

    function generateCarrierList() {
        carrierListContainer.innerHTML = '';
        for (const [key, plans] of Object.entries(plansData)) {
            const item = document.createElement('div');
            item.className = `list-item carrier-${key} fade-in`;
            
            let planHtml = '';
            for (const [pName, pInfo] of Object.entries(plans)) {
                if (pInfo.tiers) {
                    const maxTier = pInfo.tiers[pInfo.tiers.length - 1];
                    planHtml += `
                        <div class="price-item">
                            <span class="price-label">${pName}</span>
                            <span class="price-value">${maxTier.price.toLocaleString()}円〜</span>
                        </div>`;
                } else {
                    planHtml += `
                        <div class="price-item">
                            <span class="price-label">${pName}</span>
                            <span class="price-value">${pInfo.price.toLocaleString()}円</span>
                        </div>`;
                }
            }

            let discountHtml = '';
            const rules = rulesData[key];
            if (rules) {
                discountHtml = '<ul>';
                for (const r of Object.values(rules)) {
                    discountHtml += `<li>${r.name}</li>`;
                }
                discountHtml += '</ul>';
            }

            item.innerHTML = `
                <h3>${getDisplayName(key)}</h3>
                <div class="list-item-content">
                    <div class="price-section">
                        <h4>💰 基本料金（最大）</h4>
                        ${planHtml}
                    </div>
                    <div class="discount-tag-list">
                        <h4>✨ 適用可能な割引</h4>
                        ${discountHtml}
                    </div>
                </div>
            `;
            carrierListContainer.appendChild(item);
        }
    }

    startBtn.addEventListener('click', () => {
        startScreen.classList.add('hidden');
        questionContainer.classList.remove('hidden');
        updateActiveQuestions();
        showQuestion();
    });

    showListBtn.addEventListener('click', () => {
        startScreen.classList.add('hidden');
        carrierListScreen.classList.remove('hidden');
    });

    backFromListBtn.addEventListener('click', () => {
        carrierListScreen.classList.add('hidden');
        startScreen.classList.remove('hidden');
    });

    homeBtn.addEventListener('click', () => {
        if (confirm('診断を中止して最初に戻りますか？')) {
            location.reload();
        }
    });

    function showQuestion() {
        const currentId = activeQuestionIds[currentQuestionIndex];
        const question = questions.find(q => q.id === currentId);

        if (answers.contractType === '新規' && question.titleForNew) {
            questionTitle.textContent = question.titleForNew;
        } else {
            questionTitle.textContent = question.title;
        }
        
        optionsContainer.innerHTML = '';

        if (question.type === 'text') {
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'option-btn';
            input.placeholder = question.placeholder || '';
            input.value = answers[question.id] || '';
            input.style.width = '100%';
            input.style.textAlign = 'left';
            
            const nextBtn = document.createElement('button');
            nextBtn.className = 'btn btn-primary';
            nextBtn.textContent = '次へ';
            nextBtn.style.marginTop = '20px';
            nextBtn.onclick = () => selectOption(question.id, input.value || 'お客様');
            
            optionsContainer.appendChild(input);
            optionsContainer.appendChild(nextBtn);
        } else {
            question.options.forEach(option => {
                const btn = document.createElement('button');
                btn.className = 'option-btn';
                btn.textContent = getDisplayName(option);
                if (answers[question.id] === option) {
                    btn.classList.add('selected');
                }
                btn.onclick = () => selectOption(question.id, option);
                optionsContainer.appendChild(btn);
            });
        }

        const progress = ((currentQuestionIndex + 1) / activeQuestionIds.length) * 100;
        progressFill.style.width = `${progress}%`;
        prevBtn.style.display = currentQuestionIndex === 0 ? 'none' : 'block';
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
                if (shouldShow) {
                    activeQuestionIds.push(q.id);
                }
            }
        });
    }

    function showResult() {
        questionContainer.classList.add('hidden');
        resultScreen.classList.remove('hidden');

        const calculatedResults = {};
        const upgradeSuggestions = {};
        const userGB = getGBValue(answers.monthlyData);
        const currentUserGrade = rulesData.grades[answers.currentCarrier] || 0;
        
        let currentGroupKey = null;
        if (rulesData.groups) {
            for (const [groupKey, members] of Object.entries(rulesData.groups)) {
                if (members.includes(answers.currentCarrier)) {
                    currentGroupKey = groupKey;
                    break;
                }
            }
        }

        for (const [carrierKey, plans] of Object.entries(plansData)) {
            const isSameGroup = currentGroupKey && rulesData.groups[currentGroupKey].includes(carrierKey);
            const targetCarrierGrade = rulesData.grades[carrierKey] || 0;

            if (answers.contractType !== '新規' && targetCarrierGrade < currentUserGrade) {
                continue;
            }

            if (answers.contractType === 'MNP' || answers.contractType === '機種変更＋MNP') {
                if (isSameGroup && carrierKey !== answers.currentCarrier) {
                    if (targetCarrierGrade > currentUserGrade) {
                        const bestPlan = calculateBestPlan(carrierKey, plans, userGB);
                        if (bestPlan) upgradeSuggestions[carrierKey] = bestPlan;
                    }
                    continue;
                }
                if (carrierKey === answers.currentCarrier) continue;
            }

            if (answers.contractType === '機種変更') {
                if (carrierKey !== answers.currentCarrier) continue;
            }

            const bestPlan = calculateBestPlan(carrierKey, plans, userGB);
            if (bestPlan) calculatedResults[carrierKey] = bestPlan;
        }

        const recommendations = {
            price: getBest('price', calculatedResults),
            quality: getBest('quality', calculatedResults),
            service: getBest('service', calculatedResults)
        };
        lastRecs = recommendations;

        renderCarrierResult('result-price', recommendations.price);
        renderCarrierResult('result-quality', recommendations.quality);
        renderCarrierResult('result-service', recommendations.service);

        renderUpgradeSuggestions(upgradeSuggestions);
        renderAnswerSummary(answerSummary, 'summary-item');
    }

    function calculateBestPlan(carrierKey, plans, userGB) {
        let bestPlanForCarrier = null;

        for (const [planName, planInfo] of Object.entries(plans)) {
            let basePrice = 0;
            if (planInfo.type === 'tiered' || planInfo.type === 'flat') {
                const maxData = planInfo.data || (planInfo.tiers ? planInfo.tiers[planInfo.tiers.length - 1].upTo : 0);
                if (userGB > maxData) continue;
            }

            if (planInfo.tiers) {
                const tier = planInfo.tiers.find(t => userGB <= t.upTo);
                if (!tier) continue;
                basePrice = tier.price;
            } else {
                basePrice = planInfo.price;
            }

            let totalDiscount = 0;
            let currentPlanCampaignNotes = [];
            const rules = rulesData[carrierKey];
            if (rules && planInfo.discountEligibility) {
                planInfo.discountEligibility.forEach(dType => {
                    const rule = rules[dType];
                    if (!rule) return;
                    if (dType === 'family') {
                        const userAns = answers.familyLines;
                        if (rule.values) {
                            if (rule.values[userAns] !== undefined) {
                                totalDiscount += rule.values[userAns];
                            } else if ((userAns === '3回線' || userAns === '4回線' || userAns === '5回線以上') && rule.values['3回線以上'] !== undefined) {
                                totalDiscount += rule.values['3回線以上'];
                            } else if ((userAns === '2回線' || userAns === '3回線' || userAns === '4回線' || userAns === '5回線以上') && rule.values['2回線以上'] !== undefined) {
                                totalDiscount += rule.values['2回線以上'];
                            }
                        } else if (rule.value) {
                            totalDiscount += rule.value;
                        }
                    } else if (dType === 'fixedLine') {
                        if (rule.requires.includes(answers.homeInternet)) totalDiscount += rule.value;
                    } else if (dType === 'card') {
                        const card = answers.creditCard;
                        if ((carrierKey === 'docomo' && card === 'dカード') ||
                            ((carrierKey === 'au' || carrierKey === 'UQ_mobile') && card === 'au PAYカード') ||
                            ((carrierKey === 'SoftBank' || carrierKey === 'Ymobile') && card.includes('PayPayカード'))) {
                            totalDiscount += rule.value;
                        }
                    } else if (dType === 'upgrade') {
                        if (answers.contractType && answers.contractType.includes('MNP') && answers.currentCarrier === rule.from) {
                            totalDiscount += rule.value;
                            currentPlanCampaignNotes.push(`${rule.name} (${rule.note})`);
                        }
                    }
                });
            }

            const finalFee = basePrice - totalDiscount;
            let score = finalFee;
            if (userGB >= 30 && planInfo.type === 'unlimited') {
                score -= 500;
            }

            if (!bestPlanForCarrier || score < bestPlanForCarrier.score) {
                bestPlanForCarrier = { 
                    name: planName, 
                    fee: finalFee, 
                    score: score,
                    features: planInfo.features || [],
                    campaignNotes: (planInfo.campaignNotes || []).concat(currentPlanCampaignNotes)
                };
            }
        }
        return bestPlanForCarrier;
    }

    function renderUpgradeSuggestions(suggestions) {
        const container = document.getElementById('upgrade-suggestions-container');
        if (!container) return;

        container.innerHTML = '';
        const keys = Object.keys(suggestions);
        if (keys.length === 0) {
            container.classList.add('hidden');
            return;
        }

        container.classList.remove('hidden');
        const title = document.createElement('h3');
        title.textContent = '💡 同一グループ内でのアップグレード提案';
        title.style.margin = '20px 0 10px';
        title.style.fontSize = '1.2rem';
        container.appendChild(title);

        keys.forEach(key => {
            const res = suggestions[key];
            const div = document.createElement('div');
            div.className = 'upgrade-card fade-in';
            div.innerHTML = `
                <div class="upgrade-info">
                    <strong>${getDisplayName(key)} (${res.name})</strong><br>
                    <span>複雑なMNP手続き不要で、サービス品質を向上できます。</span>
                </div>
            `;
            container.appendChild(div);
        });
    }

    function renderAnswerSummary(container, itemClass) {
        container.innerHTML = '';
        activeQuestionIds.forEach(id => {
            if (id === 'userName') return;
            const q = questions.find(question => question.id === id);
            const val = answers[id];
            if (!val) return;

            const item = document.createElement('div');
            item.className = itemClass;
            const label = q.title.split('を選択')[0].split('を入力')[0];
            
            if (itemClass === 'summary-item') {
                item.innerHTML = `
                    <div class="summary-label">${label}</div>
                    <div class="summary-value">${getDisplayName(val)}</div>
                `;
            } else {
                item.className = 'cert-ans-item';
                item.innerHTML = `
                    <span class="cert-ans-label">${label}</span>
                    <span class="cert-ans-value">${getDisplayName(val)}</span>
                `;
            }
            container.appendChild(item);
        });
    }

    function getGBValue(ans) {
        if (ans === '1GB未満') return 0.5;
        if (ans === '1～3GB') return 3;
        if (ans === '3～10GB') return 10;
        if (ans === '10～20GB') return 20;
        if (ans === '20～30GB') return 30;
        if (ans === '30GB以上') return 100;
        return 5;
    }

    function getBest(category, results) {
        const categories = {
            price: ['Ymobile', 'UQ_mobile', 'ahamo'],
            quality: ['docomo', 'au', 'SoftBank'],
            service: ['SoftBank', 'au', 'docomo']
        };
        const targets = categories[category];
        let best = null;
        targets.forEach(key => {
            const res = results[key];
            if (!res) return;
            if (!best || res.fee < best.fee) {
                best = { ...res, carrier: key };
            }
        });

        if (!best) {
            for (const [key, res] of Object.entries(results)) {
                if (!best || res.fee < best.fee) {
                    best = { ...res, carrier: key };
                }
            }
        }
        return best;
    }

    function getDisplayName(name) {
        if (!name) return '---';
        const names = {
            'Ymobile': 'Y!mobile',
            'UQ_mobile': 'UQ mobile'
        };
        return names[name] || name;
    }

    function renderCarrierResult(elementId, result) {
        const container = document.getElementById(elementId);
        if (!result) {
            container.querySelector('.carrier-name').textContent = '該当なし';
            const oldFee = container.querySelector('.fee-estimate-v2');
            if (oldFee) oldFee.remove();
            const oldBadges = container.querySelectorAll('.campaign-badge');
            oldBadges.forEach(b => b.remove());
            container.querySelector('.features').innerHTML = '<li>条件に合うプランが見つかりませんでした</li>';
            return;
        }

        container.querySelector('.carrier-name').textContent = getDisplayName(result.carrier);
        const oldFee = container.querySelector('.fee-estimate-v2');
        if (oldFee) oldFee.remove();
        const oldBadges = container.querySelectorAll('.campaign-badge');
        oldBadges.forEach(b => b.remove());

        const feeDisplay = document.createElement('div');
        feeDisplay.className = 'fee-estimate-v2';
        feeDisplay.innerHTML = `<span class="fee-label">割引適用後の実質目安</span>月額 ${result.fee.toLocaleString()}円〜<br><span style="font-size: 0.9rem; color: #636e72; font-weight: 400;">(${result.name})</span>`;
        
        const list = container.querySelector('.features');
        list.innerHTML = '';
        container.insertBefore(feeDisplay, list);

        if (result.campaignNotes) {
            result.campaignNotes.forEach(note => {
                const badge = document.createElement('div');
                badge.className = 'campaign-badge';
                badge.textContent = `✨ ${note}`;
                container.insertBefore(badge, list);
            });
        }

        const features = result.features.length > 0 ? result.features : getDefaultFeatures(result.carrier);
        features.forEach(f => {
            const li = document.createElement('li');
            li.textContent = f;
            list.appendChild(li);
        });
    }

    function getDefaultFeatures(carrier) {
        const defaults = {
            docomo: ["通信エリアが広い", "大手キャリア品質"],
            au: ["Ponta連携", "店舗サポート充実"],
            SoftBank: ["PayPay連携", "特典が豊富"],
            Ymobile: ["家族・光割が強力", "店舗サポートあり"],
            UQ_mobile: ["余ったデータ繰り越し", "速度が安定"],
            ahamo: ["20GBワンプラン", "5分通話無料"]
        };
        return defaults[carrier] || [];
    }

    genCertBtn.addEventListener('click', () => {
        if (!lastRecs) return;
        certUserName.textContent = answers.userName || 'お客様';
        const now = new Date();
        certDate.textContent = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`;
        
        certResults.innerHTML = `
            <div class="cert-item">
                <div class="cert-item-cat">💰 月額料金重視</div>
                <div class="cert-item-main">
                    <div class="cert-carrier">${getDisplayName(lastRecs.price.carrier)}</div>
                    <div class="cert-fee">約${lastRecs.price.fee.toLocaleString()}円〜</div>
                </div>
            </div>
            <div class="cert-item">
                <div class="cert-item-cat">🚀 通信品質重視</div>
                <div class="cert-item-main">
                    <div class="cert-carrier">${getDisplayName(lastRecs.quality.carrier)}</div>
                    <div class="cert-fee">約${lastRecs.quality.fee.toLocaleString()}円〜</div>
                </div>
            </div>
            <div class="cert-item">
                <div class="cert-item-cat">🎁 サービス重視</div>
                <div class="cert-item-main">
                    <div class="cert-carrier">${getDisplayName(lastRecs.service.carrier)}</div>
                    <div class="cert-fee">約${lastRecs.service.fee.toLocaleString()}円〜</div>
                </div>
            </div>
        `;

        renderAnswerSummary(certAnswers, 'cert-ans-item');
        captureModal.classList.remove('hidden');
    });

    closeModal.onclick = () => captureModal.classList.add('hidden');
    document.getElementById('close-modal-btn').onclick = () => captureModal.classList.add('hidden');
    window.onclick = (e) => { if (e.target == captureModal) captureModal.classList.add('hidden'); };

    downloadImgBtn.onclick = () => {
        const target = document.getElementById('certificate-target');
        html2canvas(target).then(canvas => {
            const link = document.createElement('a');
            link.download = `キャリア診断書_${certDate.textContent}.png`;
            link.href = canvas.toDataURL();
            link.click();
        });
    };

    loadData();
});
