<template>
    <div v-on:click="openMenu"
        class="tile"
        v-bind:style="{
            transform: 'translate(' + tile.y * -100 + 'px, ' + tile.x * 100 + 'px)',
            zIndex: tile.x - tile.y
        }"
    >
        <!-- <img src="/images/tile.png"
        width="150"
        height="150"
        draggable="false"
        >-->
    </div>
</template>

<script>
    export default {
        props: ['tile'],
        methods: {
            openMenu: function(event) {
                this.$emit('tile_clicked', event, {x: this.tile.x, y: this.tile.y, z: this.tile.z});
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
    
    background-color: green;
    width: 101px;
    height: 101px;
}

</style>