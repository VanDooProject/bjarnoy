<template>
    <div
        class="queue"
    >
        <QueueItem v-bind:entry="entry" v-bind:key="entry.id" v-for="entry in queued" v-bind:now="now"></QueueItem>
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
            now: new Date(),
            lastRefresh: 0,
        };
    },
    computed: {
        queued() {
            return this.$store.state.queued;
        }
    },
    methods: {
        animationCallback: function() {
            this.lastRefresh++;
            //Update time only every 60 Frames (should be 1s)
            if(this.lastRefresh >= 60)
            {
                this.now = new Date();
                this.lastRefresh = 0;
            }
            window.requestAnimationFrame(this.animationCallback);
        }
    },
    mounted() {
        window.requestAnimationFrame(this.animationCallback);
    }
};
</script>

<style>
.queue {
    position: absolute;
    z-index: 10000;
    pointer-events: none;
}
</style>
