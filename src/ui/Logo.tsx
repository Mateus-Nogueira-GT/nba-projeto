import Image from 'next/image'

/**
 * O logo oficial do NIP — SEMPRE o arquivo de imagem do Manual da Marca
 * (public/marca/logo-nip.png, extraído do manual v1.0). O manual proíbe
 * recriar N, I, P, a bola ou o gráfico com texto e CSS, esticar, recortar ou
 * mudar as cores: por isso só a largura varia, e a proporção vem do arquivo.
 */
const PROPORCAO = 457 / 900

export function Logo({ largura, prioridade = false }: { largura: number; prioridade?: boolean }) {
  return (
    <Image
      src="/marca/logo-nip.png"
      alt="NIP — NBA Intelligence Platform"
      width={largura}
      height={Math.round(largura * PROPORCAO)}
      priority={prioridade}
      style={{ width: largura, height: 'auto' }}
    />
  )
}
