<template>
    <div
        class="tile"
        v-on:click="openMenu"
        v-on:mouseenter="openToolTip"
        v-on:mouseleave="closeToolTip"
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
        <div v-bind:style="{
                backgroundColor: 'lightblue',
                transform: 'rotateZ(-45deg) scaleY(1.5)',
                position: 'absolute',
                width: '400px',
                bottom: '250px',
                right: '-300px'
            }" v-if="showTT">
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
                showTT: false
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
.tooltip{
    position: absolute;
    display: block;
    width: 1000px;
    height: 40px;
    left: 0;
    top: 0;
    bottom: 0;
    right: 0;
    border-color: black;
    border: 2px;
    background-color: black;
    z-index: 1000000;    
}
</style>