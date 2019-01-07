<template>
    <div
        class="queueitem"
    >
        {{entry.tile.building.type}} 
        Level: {{entry.tile.building.level}} 
        Time left: {{difference}} s
    </div>
</template>

<script>
export default {
    props: ['entry'],
    components: {
        
    },
    data: function() {
        return {
            now: new Date(),
        }
    },
    computed: {
        difference() {
            var end = new Date(this.entry.startTime);
            var diff = end.getTime() - this.now.getTime();
            if(diff == 0)
            {
                this.$store.dispatch("UpdateQueued");
                this.$store.dispatch("UpdateMapTiles");
            }
            return Math.round((diff) / 1000);
        }
    },
    methods: {
        animationCallback: function() {
            window.requestAnimationFrame(this.animationCallback);
            this.now = new Date();
        }
    },
    mounted() {
        window.requestAnimationFrame(this.animationCallback);
    }
};
</script>

<style>
.queueitem {
    display: block;
}
</style>
