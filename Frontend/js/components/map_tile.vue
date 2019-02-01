<template>
    <image 
        v-bind:width=width
        v-bind:height=height
        v-bind:x="xpos"
        v-bind:y="ypos"

        xlink:href="/images/master.png"
    ></image>
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
            width: 300,
            height: 600,
            angle: -45 * Math.PI / 180,
        };
    },
    computed: {
        xpos() {
            return this.width * (this.tile.position.x * Math.cos(this.angle) - this.tile.position.y * Math.sin(this.angle))/Math.SQRT2 + this.mapOffset.x;
            
        },
        ypos() {
            return this.height *(this.tile.position.y * Math.cos(this.angle) + this.tile.position.x * Math.sin(this.angle))/Math.SQRT2 + this.mapOffset.y;
        },
        mapOffset() {
            return this.$store.state.mapOffset;
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
    background-image: url("/images/master.png");
    position: absolute;
    display: block;
    left: 0;
    top: 0;
    bottom: 0;
    right: 0;
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