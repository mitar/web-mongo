<template>
  <h1 class="red">{{msg}}</h1>
</template>

<script>
  export default {
    data () {
      return {
        msg: 'Hello world!'
      }
    }
  }
</script>

<style lang="scss">
  .red {
    color: #f00;
  }
</style>
