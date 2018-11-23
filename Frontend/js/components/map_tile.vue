<template>
    <div class="tile">
        ( {{ tile.x }} | {{ tile.y }} )
    </div>
</template>

<script>
    export default {
        props: ['tile'],
        data: function() {
            return {
                tile: {}
            }
        }
    }

    // https://forum.vuejs.org/t/debugging-vue-files-with-visual-studio-code/8022/5
    //# sourceURL=map_tile.vue
</script>

<style>
.tile {
    display: block;
    width: 60px;
    height: 60px;
    background-color: green;
    margin: 2px;
}

</style>