<template>
    <div
        class="tile"
        v-on:click="openMenu"
        v-bind:style="{
            position: 'absolute',
            transform: 'translate(' + tile.y * -100 + 'px, ' + tile.x * 100 + 'px)',
            zIndex: tile.x - tile.y
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
                    return "/images/tile_" + this.tile.type + ".png"
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