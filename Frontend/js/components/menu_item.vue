<template>
    <img
        src="/images/circle1.png" 
        v-bind:style="{
            top: pos.y - size/2 + 'px',
            left: pos.x - size/2 + 'px',
            width: size + 'px',
            height: size + 'px',
            zIndex: 50001
        }"
        v-on:click="onClick"
        class="mapsubmenu"
    />
</template>

<script>
    export default {
        props:["submenu", "submenutotal", "submenulayer", "type"],
        data: function() {
            return {

            }
        },
        computed: {
            angle() {
                return (this.submenu * 2 * Math.PI / this.submenutotal);
            },
            pos() {
                return {x: Math.sin(this.angle)*this.submenulayer*100, y: Math.cos(this.angle)*this.submenulayer*100};
            },
            tile() { 
                return this.$store.state.menuTile;
            },
            size() {
                return 75 * this.submenulayer;
            }
        },
        methods: {
            onClick: function (event) {
                this.axios
                .post(this.$config.RequestUriPrefix + '/api/v1/Building/build',
                    {
                        tile: this.tile,
                        buildingName: this.type.name,
                        level: this.type.level,
                    },
                    {
                        headers: {'Authorization': "bearer " + localStorage.token},
                        withCredentials: true // CORS cookie issue: https://github.com/axios/axios/issues/876
                    })
                .then(response => {
                    this.$store.dispatch("UpdateMapTiles");
                    this.$store.dispatch("UpdateQueued");
                })
                .catch(error => this.$store.commit('ReqestErr', error.response));
                this.$store.commit("SetMenuVisible", false);
            }
        },
        mounted () {
            
        },
    }
</script>

<style>
.mapsubmenu {
    position: absolute;
}
</style>