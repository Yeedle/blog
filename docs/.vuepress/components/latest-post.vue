<template>
  <div>
    <h1 class="title">
      <a :href="page.path">{{page.title}}</a>
    </h1>
    <p class="date" v-if="date !== ''">
      {{date}}
    </p>
    <p class="excerpt">
      {{page.frontmatter.excerpt}}
    </p>
  </div>
</template>

<script>
import { Page } from '../../utils'

export default {
  props: {
    page: {
      required: true
    }
  },
  computed: {
    date () {
      if (!this.page.frontmatter.date) return ''
      else return new Date(this.page.frontmatter.date)
        .toLocaleDateString('en-US', { 
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
        })
    }
  }
}
</script>

<style scoped>
.title {
  margin-bottom: 0px;
}
.date {
  color: #9a9a9a;
  margin-top: 0px;
}

.excerpt {
  margin-top: 0em;
  margin-bottom: 3.5em;
  font-size: 20px;
}
</style>
