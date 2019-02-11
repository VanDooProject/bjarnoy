<template>
  <div
    class="tile"
    v-on:click="openMenu"
    v-on:mouseenter="openToolTip"
    v-on:mouseleave="closeToolTip"
    v-bind:style="{
            position: 'absolute',
            /* ATTENTION: x and y are swapped */
            transform: 'translate(' + tile.position.x * width / Math.SQRT2 + 'px, ' + tile.position.y * - width / Math.SQRT2 + 'px)',
            width:  width / Math.SQRT2 + 'px',
            height: width / Math.SQRT2 + 'px',
            zIndex: tile.position.x - tile.position.y
        }"
  >
    <img v-bind:src=imgsrc v-bind:alt="tile.building ? tile.building.type : tile.type"
        v-bind:style="{
            zIndex: tile.position.x - tile.position.y,
            transform: 'translate(-' + width/2 + 'px,-' + height/2 + 'px) rotateZ(-45deg) scaleY(2.365)'
        }"
        class="tileimg"
    >
    <div v-if="showTT" class="tiletooltip">{{tile}}</div>
  </div>
</template>

<script>
export default {
    props: ["tile"],
    methods: {
        openMenu: function (event) {
            if (
                this.$store.state.mouseMove.x < 5 &&
                this.$store.state.mouseMove.y < 5
            ) {
                if (
                this.$store.state.menuVisible == false &&
                this.$store.state.menuClosed == false
                ) {
                this.$store.commit("SetMenuPos", { x: event.pageX, y: event.pageY });
                this.$store.commit("SetMenuTile", this.tile);
                this.$store.commit("SetMenuVisible", true);
                }
            }
            this.$store.commit("SetMenuClosed", false);
        },
        openToolTip: function () {
            this.showTT = true;
        },
        closeToolTip: function () {
            this.showTT = false;
        }
    },
    data: function () {
        return {
            showTT: false,
            width: 400,
            height: 600,
        };
    },
    computed: {
        imgsrc() { 
            if(this.tile.building == undefined)
            {
                return "images/tiles/" + this.tile.type.toLowerCase() + "_" + this.tile.orientation.charAt(0) + ".png";
            }
            else
            {
                return "images/tiles/" + this.tile.building.type.toLowerCase() + "_" + this.tile.orientation.charAt(0) + "_level" + this.tile.building.level.toString().padStart(3,'0') + ".png";
            }
        }
    }
};

// https://forum.vuejs.org/t/debugging-vue-files-with-visual-studio-code/8022/5
//# sourceURL=map_tile.vue
</script>

<style>
.tile {
    position: absolute;

    display: block;
    left: 0;
    top: 0;
    bottom: 0;
    right: 0;
    padding: 0px;
    margin: 0px;
}
.tileimg {
    position: absolute;
    padding: 0px;
    margin: 0px;
    pointer-events: none;
}
.tiletooltip {
    background: rgba(0, 0, 0, 0.75);
    color: white;
    transform: rotateZ(-45deg) scaleY(2);
    position: absolute;
    width: 400px;
    bottom: 400px;
    right: 200px;
    padding: 10px;
    border-radius: 10px;
    z-index: -10000;
}
</style>