<template>
  <div class="events">
    <h1>Events</h1>
    <button @click.prevent="onClick">Add event</button>
    <ul>
      <li v-for="event in events">
        {{event.createdAt}}: {{event.message}}
      </li>
    </ul>
  </div>
</template>

<script>
  import {Event} from './collections';

  export default {
    data() {
      return {
        events: Event.documents,
      }
    },

    methods: {
      onClick: Event.addEvent,
    },
  }
</script>

<style lang="scss">
</style>
