<template>
    <div
        class="queue"
    >
        <QueueItem v-bind:entry="entry" v-bind:key="entry.id" v-for="entry in queued"></QueueItem>
    </div>
</template>

<script>
import QueueItem from "./queue_item.vue";

export default {
    props: [],
    components: {
        QueueItem
    },
    data: function() {
        return {
            
        };
    },
    computed: {
        queued() {
            return this.$store.state.queued;
        }
    },
    methods: {
    
    },
    mounted() {
        
    }
};
</script>

<style>
.queue {
    position: absolute;
    z-index: 10000;
}
</style>
