import Link from 'next/link'

export default function NaoEncontrada() {
  return (
    <main
      style={{
        display: 'grid',
        placeItems: 'center',
        minHeight: '100dvh',
        padding: 24,
        textAlign: 'center',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--fonte-heroi)', fontSize: 72, lineHeight: 1 }}>404</span>
        <p style={{ fontSize: 18, fontWeight: 700 }}>Esta página não existe</p>
        <p style={{ color: 'var(--texto-2)' }}>O link pode estar errado ou a página mudou de lugar.</p>
        <Link
          href="/"
          style={{ marginTop: 8, padding: '12px 20px', borderRadius: 8, background: 'var(--acento)', fontWeight: 700 }}
        >
          Ir para Entradas
        </Link>
      </div>
    </main>
  )
}
