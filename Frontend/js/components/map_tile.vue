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
        <img src="/images/tile.png"
            draggable="false"
            style="
                transform: translate(-50px,-50px);
                pointer-events: none;
            "
        >
    </div>
</template>

<script>
    export default {
        props: ['tile'],
        methods: {
            openMenu: function(event) {
                this.$emit('tile_clicked', event);
            }
        },
        data: function() {
            return {
                //tile: {}
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
/*    width:"100";
    height:"100";
    min-width:"100";
    min-height:"100";

    background-color: green;    
    border:1px solid black;
    border-top-style: none;
    border-right-style: solid;
    border-bottom-style: solid;
    border-left-style: none;*/
}

.tile:hover {
    background-color: greenyellow;
}

</style>