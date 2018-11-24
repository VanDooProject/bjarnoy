<template>
    <div v-on:click="openMenu"
        class="tile"
        v-bind:style="{
                top: tile.y * -60 + 'px',
                left: tile.x * 60 + 'px',
                zIndex: tile.x + tile.y
            }"
    >
        ( {{ tile.x }} | {{ tile.y }} )
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
    display: block;

    position: absolute;

    width: 58px;
    height: 58px;

   background-color: green;
    margin: 2px;
}

.tile:hover {
    background-color: greenyellow;
}

</style>