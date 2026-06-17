
const fs = require('fs');
const path = require('path');

// Load data files
const plansData = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/plans.json'), 'utf8'));
const rulesData = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/rules.json'), 'utf8'));

// Mocking the GB logic from script.js
function getGBValue(ans) {
    if (ans === '1GB未満') return 0.5;
    if (ans === '1～3GB') return 3;
    if (ans === '3～10GB') return 10;
    if (ans === '10～20GB') return 20;
    if (ans === '20～30GB') return 30;
    if (ans === '30GB以上') return 100;
    return 5;
}

// Logic extracted from script.js
function calculateResults(answers) {
    const calculatedResults = {};
    const userGB = getGBValue(answers.monthlyData);

    for (const [carrierKey, plans] of Object.entries(plansData)) {
        // MNP/機種変更系の場合、現在のキャリアは除外
        if (
            (answers.contractType === 'MNP' || answers.contractType === '機種変更＋MNP') &&
            answers.currentCarrier === carrierKey
        ) {
            continue;
        }

        let bestPlanForCarrier = null;
        // ... (rest of the logic)

        for (const [planName, planInfo] of Object.entries(plans)) {
            let basePrice = 0;
            // データ容量チェック (Fixed Logic)
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
                    } else if (dType === 'uq_5gb_special') {
                        if (userGB <= 5) totalDiscount += rule.value;
                    }
                });
            }

            const finalFee = basePrice - totalDiscount;
            
            // 判定スコア (Improved Logic)
            let score = finalFee;
            if (userGB >= 30 && planInfo.type === 'unlimited') {
                score -= 500; 
            }

            if (!bestPlanForCarrier || score < bestPlanForCarrier.score) {
                bestPlanForCarrier = { name: planName, fee: finalFee, score: score };
            }
        }
        if (bestPlanForCarrier) calculatedResults[carrierKey] = bestPlanForCarrier;
    }

    const getBest = (category, results) => {
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

        // Fallback: If no preferred carrier is found, pick the best from all available results
        if (!best) {
            for (const [key, res] of Object.entries(results)) {
                if (!best || res.fee < best.fee) {
                    best = { ...res, carrier: key };
                }
            }
        }
        return best;
    };

    return {
        price: getBest('price', calculatedResults),
        quality: getBest('quality', calculatedResults),
        service: getBest('service', calculatedResults)
    };
}

// Test Scenarios
const scenarios = [
    {
        name: "Case 1: Light User (1GB未満, No fixed line)",
        answers: { monthlyData: "1GB未満", familyLines: "1回線", homeInternet: "なし", creditCard: "その他" }
    },
    {
        name: "Case 2: Heavy User (30GB以上, No fixed line)",
        answers: { monthlyData: "30GB以上", familyLines: "1回線", homeInternet: "なし", creditCard: "その他" }
    },
    {
        name: "Case 3: Family of 3 (SoftBank Light User, SoftBank Hikari)",
        answers: { monthlyData: "1～3GB", familyLines: "3回線以上", homeInternet: "SoftBank光", creditCard: "PayPayカード" }
    },
    {
        name: "Case 4: docomo Fan (Heavy User, docomo Hikari, d-card)",
        answers: { monthlyData: "30GB以上", familyLines: "3回線以上", homeInternet: "docomo光", creditCard: "dカード" }
    },
    {
        name: "Case 5: ahamo User (30GB以上, MNP) - POTENTIAL FAILURE",
        answers: { contractType: "MNP", currentCarrier: "ahamo", monthlyData: "30GB以上", familyLines: "1回線", homeInternet: "なし", creditCard: "その他" }
    }
];

console.log("=== Diagnostic Logic Audit (FIXED) ===\n");
scenarios.forEach(s => {
    const res = calculateResults(s.answers);
    console.log(`[Scenario] ${s.name}`);
    console.log(`- Recommended (Price):   ${res.price ? res.price.carrier + " (" + res.price.name + ", " + res.price.fee + " yen)" : "N/A"}`);
    console.log(`- Recommended (Quality): ${res.quality ? res.quality.carrier + " (" + res.quality.name + ", " + res.quality.fee + " yen)" : "N/A"}`);
    console.log(`- Recommended (Service): ${res.service ? res.service.carrier + " (" + res.service.name + ", " + res.service.fee + " yen)" : "N/A"}`);
    console.log("------------------------------------------");
});
