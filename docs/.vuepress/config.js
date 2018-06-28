module.exports = {
  title: 'Seeing the Elephant',
  base: '',
  themeConfig: {
    nav: [
      { text: 'about', link: '/about' },
      { text: 'github', link: 'https://github.com/yeedle' }
    ]
  },
  markdown: {
    config: md => {
      md.use(require('markdown-it-footnote'))
    }
  }
}