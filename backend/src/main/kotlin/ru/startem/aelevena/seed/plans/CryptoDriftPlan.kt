package ru.startem.aelevena.seed.plans

import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.stereotype.Component
import ru.startem.aelevena.api.dto.WorkflowGraph
import ru.startem.aelevena.seed.DemoWorkflowPlan
import ru.startem.aelevena.seed.PlanBuilders

/**
 * Fintech / treasury: сигнал на ребаланс крипто-портфеля по drift'у от целевой структуры.
 * Реальные данные: api.coingecko.com (/simple/price) — публичный endpoint, без ключей и без авторизации.
 *
 * Trigger — webhook: внешняя система пушит снимок позиций ({holdings,targets}), workflow считает дрейф
 * и возвращает рекомендации BUY/SELL/HOLD. Webhook генерирует токен в `triggers.token` — это
 * наглядный пример того, как «снаружи» поднимают runtime-инстанс workflow.
 */
@Component
class CryptoDriftPlan(objectMapper: ObjectMapper) : DemoWorkflowPlan {
    private val b = PlanBuilders(objectMapper)

    override val name: String = "Crypto Allocation Drift — Rebalance Signal"
    override val description: String =
        "Webhook-driven сигнал ребаланса крипто-портфеля. Принимает {holdings:{...}, targets:{...}} " +
            "в payload, тянет live-цены и 24h-движение с CoinGecko, считает drift по каждой позиции и " +
            "выдаёт recommended deltas (BUY/SELL/HOLD)."

    override fun buildGraph(): WorkflowGraph {
        val trigger = b.node(
            id = "start", type = "trigger.webhook",
            x = 80.0, y = 200.0, label = "Webhook: positions in",
            purpose = "Точка входа. Внешняя система POSTит JSON {holdings, targets} — это становится runInput.",
        )
        val prices = b.node(
            id = "prices", type = "http",
            x = 380.0, y = 80.0, label = "Live prices: CoinGecko",
            purpose = "Тянет spot-цены и 24h-движение по BTC, ETH, SOL, ADA, DOT в USD.",
            inputsHint = "Не зависит от других нод — фиксированный URL CoinGecko /simple/price.",
            config = b.httpConfig(
                "https://api.coingecko.com/api/v3/simple/price" +
                    "?ids=bitcoin,ethereum,solana,cardano,polkadot" +
                    "&vs_currencies=usd&include_24hr_change=true&include_market_cap=true",
            ),
        )
        val drift = b.node(
            id = "drift", type = "javascript",
            x = 720.0, y = 200.0, label = "Drift → rebalance signal",
            purpose = "Считает drift каждой позиции и формирует BUY/SELL/HOLD-рекомендации для PM/treasury.",
            inputsHint = "Принимает:\n" +
                "• inputs.prices.body — карта { bitcoin: { usd, usd_24h_change, usd_market_cap }, ... }\n" +
                "• runInput.holdings — { bitcoin: amount_usd, ... } (приходит из payload вебхука)\n" +
                "• runInput.targets  — { bitcoin: 0.40, ... } (целевые веса, сумма ≈ 1.0)\n" +
                "Если runInput пустой — используются defaults (наглядно для ручного теста).",
            config = b.jsConfig(DRIFT_JS),
        )

        // start → drift нет: runInput (payload вебхука) доступен в любом узле через input.runInput.
        return b.graph(
            nodes = listOf(trigger, prices, drift),
            edges = listOf(
                b.edge("start", "prices"),
                b.edge("prices", "drift"),
            ),
        )
    }

    companion object {
        private val DRIFT_JS = """
            // Inputs:
            //   inputs.prices.body: { bitcoin: { usd, usd_24h_change, usd_market_cap }, ... }
            //   runInput.holdings:  { bitcoin: 22000, ... }
            //   runInput.targets:   { bitcoin: 0.40, ... }
            // Output: PM brief { headline, summary, keyInsights, actionItems, report, details }
            async function run(input) {
                const prices = (input.inputs.prices || {}).body || {};
                const payload = input.runInput || {};
                const holdings = payload.holdings || {
                    bitcoin: 22000, ethereum: 14500, solana: 6500, cardano: 4200, polkadot: 2800,
                };
                const targets = payload.targets || {
                    bitcoin: 0.40, ethereum: 0.30, solana: 0.15, cardano: 0.10, polkadot: 0.05,
                };
                const assets = Object.keys(targets);
                const totalUsd = assets.reduce(function (acc, k) { return acc + (holdings[k] || 0); }, 0);
                const positions = assets.map(function (asset) {
                    const usd = holdings[asset] || 0;
                    const target = targets[asset];
                    const currentWeight = totalUsd > 0 ? usd / totalUsd : 0;
                    const drift = currentWeight - target;
                    const targetUsd = totalUsd * target;
                    const deltaUsd = targetUsd - usd;
                    let action = 'HOLD';
                    if (drift > 0.02) action = 'SELL';
                    else if (drift < -0.02) action = 'BUY';
                    const px = prices[asset] || {};
                    return {
                        asset: asset,
                        currentUsd: Math.round(usd * 100) / 100,
                        currentWeight: Math.round(currentWeight * 10000) / 10000,
                        targetWeight: target,
                        driftPct: Math.round(drift * 10000) / 100,
                        action: action,
                        recommendedDeltaUsd: Math.round(deltaUsd * 100) / 100,
                        spotPriceUsd: px.usd || null,
                        change24hPct: px.usd_24h_change != null ? Math.round(px.usd_24h_change * 100) / 100 : null,
                        marketCapUsd: px.usd_market_cap || null,
                    };
                });
                positions.sort(function (a, b) { return Math.abs(b.driftPct) - Math.abs(a.driftPct); });
                const alerts = positions.filter(function (p) { return p.action !== 'HOLD'; });

                const headline = alerts.length === 0
                    ? '✅ Portfolio within ±2% target band — no rebalance needed'
                    : '🔁 ' + alerts.length + ' position(s) outside ±2% target — execute rebalance';

                const summary = 'Portfolio: USD ' + (Math.round(totalUsd * 100) / 100).toLocaleString('en-US')
                    + '. ' + alerts.length + ' alert(s) of ' + positions.length + ' assets. '
                    + (alerts.length > 0
                        ? 'Biggest drift: ' + positions[0].asset + ' at ' + positions[0].driftPct + '% (' + positions[0].action + ').'
                        : 'All allocations within tolerance.');

                const keyInsights = positions.map(function (p) {
                    const arrow = p.driftPct >= 0 ? '+' : '';
                    return p.asset + ' — ' + p.action + ': current ' + (p.currentWeight * 100).toFixed(1) + '%'
                        + ' vs target ' + (p.targetWeight * 100).toFixed(1) + '% (drift ' + arrow + p.driftPct + '%)'
                        + (p.change24hPct != null ? ', 24h ' + (p.change24hPct >= 0 ? '+' : '') + p.change24hPct + '%' : '');
                });

                const actionItems = alerts.length > 0
                    ? alerts.map(function (p) {
                        const verb = p.action === 'BUY' ? 'Buy' : 'Sell';
                        const amt = Math.abs(p.recommendedDeltaUsd).toFixed(2);
                        return verb + ' ' + p.asset + ' ≈ USD ' + amt + ' (current USD ' + p.currentUsd.toFixed(2) + ')';
                    })
                    : ['No trades — re-check at next rebalance window'];

                const reportLines = [
                    '## Crypto Allocation Drift — rebalance signal',
                    '',
                    headline,
                    '',
                    '**Summary.** ' + summary,
                    '',
                    '### Positions',
                    '| Asset | Action | Current % | Target % | Drift % | Δ USD | 24h % |',
                    '|---|---|---:|---:|---:|---:|---:|',
                ];
                positions.forEach(function (p) {
                    reportLines.push('| ' + p.asset + ' | ' + p.action
                        + ' | ' + (p.currentWeight * 100).toFixed(1) + '%'
                        + ' | ' + (p.targetWeight * 100).toFixed(1) + '%'
                        + ' | ' + p.driftPct + '%'
                        + ' | USD ' + p.recommendedDeltaUsd.toFixed(2)
                        + ' | ' + (p.change24hPct != null ? p.change24hPct + '%' : '–')
                        + ' |');
                });
                reportLines.push('');
                reportLines.push('### Action items');
                actionItems.forEach(function (a) { reportLines.push('- ' + a); });

                return {
                    headline: headline,
                    summary: summary,
                    keyInsights: keyInsights,
                    actionItems: actionItems,
                    report: reportLines.join('\n'),
                    details: {
                        evaluatedAt: new Date().toISOString(),
                        portfolioUsd: Math.round(totalUsd * 100) / 100,
                        alertCount: alerts.length,
                        positions: positions,
                    },
                };
            }
        """.trimIndent()
    }
}
