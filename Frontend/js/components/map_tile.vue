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
                backgroundPositionX: '-1400px',
                backgroundPositionY: '-600px',
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
                
            }
        },
        computed: {
            imgSrc() {
                switch(this.tile.type)
                {
                    case "GrasTile":
                        return "/images/tile_grass.png"
                    case "MountainTile":
                        return "/images/tile_hill.png"
                    case "ForestTile":
                        return "/images/tile_for.png"
                    default:
                        return "/images/tile_grass.png"
                }
            }
        }
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
    background-color: black
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