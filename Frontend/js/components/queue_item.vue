<template>
    <div>
        {{entry.tile.building.type}} 
        Level: {{entry.tile.building.level}} 
        Time left: {{String(Math.floor(difference/(60 * 60))).padStart(2,0)}}:{{String(Math.floor(difference/60) % 60).padStart(2,0)}}:{{String(difference % 60).padStart(2,0)}}<br/>
        <b-progress :max="100">
        <b-progress-bar :value="progress" :label="progress.toFixed(0)+'%'"></b-progress-bar>
        </b-progress>
    </div>
</template>

<script>
export default {
    props: ['entry'],
    components: {
        
    },
    data: function() {
        return {
        }
    },
    computed: {
        difference() {
            var end = new Date(this.entry.endTime);
            var diff = end.getTime() - this.$store.state.now.getTime();
            if(diff <= 0) //Will be changed in the future!
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
