<template>
    <div v-on:click="openMenu"
        class="tile"
        v-bind:style="{
            transform: 'translate(' + tile.y * -100 + 'px, ' + tile.x * 100 + 'px)',
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

    width: 95px;
    height: 95px;

    background-color: green;
    margin: 5px;
}

.tile:hover {
    background-color: greenyellow;
}

</style>