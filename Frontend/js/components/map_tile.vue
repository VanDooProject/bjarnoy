<template>
    <div
        class="tile"
        v-on:click="openMenu"
        v-on:mouseenter="openToolTip"
        v-on:mouseleave="closeToolTip"
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
        >
        </div>
        <div v-if="showTT"
            class="tiletooltip"
            >
            {{tile}}
        </div>
    </div>
</template>

<script>
    export default {
        props: ['tile'],
        methods: {
            openMenu: function(event) {
                this.$emit('tile_clicked', event, this.tile);
            },
            openToolTip: function() {
                this.showTT = true;
            },
            closeToolTip: function() {
                this.showTT = false;
            }
        },
        data: function() {
            return {
                showTT: false,
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
                            entry = response.data.filter(obj => obj.name == "grasstile_" + this.tile.orientation[0] + ".png")[0]
                            this.imgPos = {y: entry.x, x: entry.y}
                            break;
                        case "MountainTile":
                            entry = response.data.filter(obj => obj.name == "mountaintile_" + this.tile.orientation[0] + ".png")[0]
                            this.imgPos = {y: entry.x, x: entry.y}
                            break;
                        case "ForestTile":
                            entry = response.data.filter(obj => obj.name == "foresttile_" + this.tile.orientation[0] + ".png")[0]
                            this.imgPos = {y: entry.x, x: entry.y}
                            break;

                        case "QuarterEdgeTile":
                            entry = response.data.filter(obj => obj.name == "quarteredgetile_" + this.tile.orientation[0] + ".png")[0]
                            this.imgPos = {y: entry.x, x: entry.y}
                            break;
                        case "HalfEdgeTile":
                            entry = response.data.filter(obj => obj.name == "halfedgetile_" + this.tile.orientation[0] + ".png")[0]
                            this.imgPos = {y: entry.x, x: entry.y}
                            break;
                        case "TriQuarterEdgeTile":
                            entry = response.data.filter(obj => obj.name == "triquarteredgetile_" + this.tile.orientation[0] + ".png")[0]
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
.tiletooltip{
    background:rgba(0, 0, 0, 0.75);
    color: white;
    transform: rotateZ(-45deg) scaleY(2);
    position: absolute;
    width: 400px;
    bottom: 200px;
    right: 0px;
    padding: 10px;
    border-radius: 10px;
}
</style>