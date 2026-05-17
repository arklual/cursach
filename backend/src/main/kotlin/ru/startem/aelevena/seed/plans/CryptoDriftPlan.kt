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
        val trigger = b.node("start", "trigger.webhook", 80.0, 200.0, "Webhook: positions in")
        val prices = b.node(
            "prices", "http", 380.0, 80.0, "CoinGecko spot prices",
            b.httpConfig(
                "https://api.coingecko.com/api/v3/simple/price" +
                    "?ids=bitcoin,ethereum,solana,cardano,polkadot" +
                    "&vs_currencies=usd&include_24hr_change=true&include_market_cap=true",
            ),
        )
        val drift = b.node(
            "drift", "javascript", 720.0, 200.0, "Drift + rebalance",
            b.jsConfig(DRIFT_JS),
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
                return {
                    evaluatedAt: new Date().toISOString(),
                    portfolioUsd: Math.round(totalUsd * 100) / 100,
                    alertCount: alerts.length,
                    actions: alerts.map(function (p) {
                        return { asset: p.asset, action: p.action, deltaUsd: p.recommendedDeltaUsd };
                    }),
                    positions: positions,
                };
            }
        """.trimIndent()
    }
}
