export default function manifest() {
  return {
    name: '畑しごと - 農作業管理',
    short_name: '畑しごと',
    description: '畑・作付け・日々の作業をチームで共有する農作業管理アプリ',
    start_url: '/',
    display: 'standalone',
    background_color: '#f7faf7',
    theme_color: '#174c38',
    lang: 'ja',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  }
}
