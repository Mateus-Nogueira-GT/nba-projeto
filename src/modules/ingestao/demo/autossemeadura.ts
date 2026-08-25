/**
 * A guarda do re-seed automático da demonstração.
 *
 * O cron `/api/cron/demo` reancora a demo para a rodada do dia — o que é
 * exatamente o que se quer enquanto o banco é de DEMONSTRAÇÃO, e exatamente o
 * que NÃO se pode querer no dia em que um provedor real estiver escrevendo
 * ali. Por isso a autorização é uma variável explícita, e o padrão é
 * desligado: esquecer de ligar custa uma demo desatualizada; esquecer de
 * desligar custaria dado real sobrescrito por dado fictício.
 *
 * Comparação estrita com 'true' de propósito — '1', 'TRUE' e 'sim' não ligam
 * nada. Uma variável ambígua é como se liga o que não se queria ligar.
 */
export function autossemeaduraHabilitada(env: Record<string, string | undefined>): boolean {
  return env.DEMO_AUTOSSEMEADURA === 'true'
}
