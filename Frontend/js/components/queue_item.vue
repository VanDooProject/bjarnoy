<template>
    <div>
        {{entry.tile.building.type}} 
        Level: {{entry.tile.building.level}} 
        Time left: {{Math.round(difference/60)}} min {{difference % 60}} s<br/>
        <b-progress :max="100">
        <b-progress-bar :value="progress" :label="progress.toFixed(0)+'%'"></b-progress-bar>
        </b-progress>
    </div>
</template>

<script>
export default {
    props: ['entry', 'now'],
    components: {
        
    },
    data: function() {
        return {
        }
    },
    computed: {
        difference() {
            var end = new Date(this.entry.endTime);
            var diff = end.getTime() - this.now.getTime();
            if(diff == 0)
            {
                this.$store.dispatch("UpdateQueued");
                this.$store.dispatch("UpdateMapTiles");
            }
            return Math.round((diff) / 1000);
        },
        progress() {
            var duration = (new Date(this.entry.endTime).getTime() - new Date(this.entry.startTime).getTime()) / 1000;
            return (1- this.difference / duration) * 100;
        }
    },
    methods: {
        
    },
    mounted() {

    }
};
</script>
<style>
</style>
