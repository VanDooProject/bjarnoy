<template>
    <div
        class="tile"
        v-on:click="openMenu"
        v-bind:style="{
            position: 'absolute',
            transform: 'translate(' + tile.position.y * -141 + 'px, ' + tile.position.x * 141 + 'px)',
            zIndex: tile.position.x - tile.position.y
        }"
    >
        <div  
            v-bind:style="{
                zIndex: tile.position.x - tile.position.y,
                backgroundPositionX: - imgPos.x + 'px',
                backgroundPositionY: - imgPos.y + 'px',
            }"
            class="tileimg"
        ></div>
    </div>
</template>

<script>
    export default {
        props: ['tile'],
        methods: {
            openMenu: function(event) {
                this.$emit('tile_clicked', event, this.tile);
            }
        },
        data: function() {
            return {
                imgPos: {x: 0, y: 0}
            }
        },
        computed: {

        },
        mounted () {
            this.axios
                .get('/images/data.json',
                {
                        withCredentials: true // CORS cookie issue: https://github.com/axios/axios/issues/876
                })
                .then(response => { 
                    var entry;
                    switch (this.tile.type)
                    {
                        case "GrassTile":
                            entry = response.data.filter(obj => obj.name == "grasstile_E.png")[0]
                            this.imgPos = {y: entry.x, x: entry.y}
                            break;
                        case "MountainTile":
                            entry = response.data.filter(obj => obj.name == "mountaintile_E.png")[0]
                            this.imgPos = {y: entry.x, x: entry.y}
                            break;
                        case "ForestTile":
                            entry = response.data.filter(obj => obj.name == "foresttile_E.png")[0]
                            this.imgPos = {y: entry.x, x: entry.y}
                            break;
                        default:
                            this.imgPos = {x: 600, y: 600}
                    }

                })
                .catch(error => this.$store.commit('ReqestErr'));
        },
    }

    // https://forum.vuejs.org/t/debugging-vue-files-with-visual-studio-code/8022/5
    //# sourceURL=map_tile.vue
</script>

<style>
.tile {
    position: absolute;

    display: block;
    width: 141px;
    height: 141px;
    left: 0;
    top: 0;
    bottom: 0;
    right: 0;
    padding: 0px;
    margin: 0px;
}
.tileimg {
    background-image:url("/images/master.png");
    position: absolute;
    display: block;
    width: 200px;
    height: 300px;
    left: 0;
    top: 0;
    bottom: 0;
    right: 0;
    padding: 0px;
    margin: 0px;
    transform: translate(-100px,-150px) rotateZ(-45deg) scaleY(2.38);
    pointer-events: none;
}
</style>