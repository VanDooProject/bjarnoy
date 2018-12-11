<template>
    <div
        class="tile"
        v-on:click="openMenu"
        v-bind:style="{
            position: 'absolute',
            transform: 'translate(' + tile.position.y * -100 + 'px, ' + tile.position.x * 100 + 'px)',
            zIndex: tile.position.x - tile.position.y
        }"
    >
        <img v-bind:src="imgSrc"
            draggable="false"
            width="141px"
            height="500px"
            class="tileimg"
        >
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
    width: 100px;
    height: 100px;
    left: 0;
    top: 0;
    bottom: 0;
    right: 0;
    padding: 0px;
    margin: 0px;
}
.tileimg {
    position: absolute;
    transform: translate(-70px,-250px) rotateZ(-45deg);
    pointer-events: none;
}
</style>