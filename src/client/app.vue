<template>
  <div class="events">
    <h1>Events</h1>
    <button @click.prevent="onClick" :disabled="eventCreationInProgress">Add event</button>
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
        eventCreationInProgress: false,
      }
    },

    methods: {
      async onClick() {
        this.eventCreationInProgress = true;
        await Event.addEvent();
        this.eventCreationInProgress = false;
      }
    },
  }
</script>

<style lang="scss">
</style>
