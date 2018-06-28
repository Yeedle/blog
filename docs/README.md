---
home: true
footer: 
---

<div v-for="page in $site.pages.sort((a, b) => {
          const dateA = new Date(a.frontmatter.date)
          const dateB = new Date(b.frontmatter.date)
          if (dateA > dateB) return -1
          else if (dateA == dateB) return 0
          else return 1
        })">
  <latest-post v-if="!page.frontmatter.home" :page="page"/>
</div>

<style scoped>
@import url('https://fonts.googleapis.com/css?family=PT+Sans|PT+Serif');
html, body {
  font-family: "PT Serif", Georgia, "Times New Roman", serif;
}

h1, h2, h3, h4, h5, h6 {
  font-family: "PT Sans", Helvetica, Arial, sans-serif;
  font-weight: 400;
  color: #313131;
  letter-spacing: -.025rem;
}
</style>