<template>
  <div
    class="tile"
    v-on:click="openMenu"
    v-on:mouseenter="openToolTip"
    v-on:mouseleave="closeToolTip"
    v-bind:style="{
            position: 'absolute',
            /* ATTENTION: x and y are swapped */
            transform: 'translate(' + tile.position.x * img.size.x / Math.SQRT2 + 'px, ' + tile.position.y * -img.size.x / Math.SQRT2 + 'px)',
            width:  img.size.x / Math.SQRT2 + 'px',
            height: img.size.x / Math.SQRT2 + 'px',
            zIndex: tile.position.x - tile.position.y
        }"
  >
    <div
      v-bind:style="{
                zIndex: tile.position.x - tile.position.y,
                /* ATTENTION: x and y are swapped */
                backgroundPositionX: - img.pos.y + 'px',
                backgroundPositionY: - img.pos.x + 'px',
                width: img.size.x + 'px',
                height: img.size.y + 'px',
                transform: 'translate(-' + img.size.x/2 + 'px,-' + img.size.y/2 + 'px) rotateZ(-45deg) scaleY(2.365)'
            }"
      class="tileimg"
    ></div>
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
        };
    },
    computed: {
        img() {
            const imgmap = this.$store.state.imageMap;
            var entry = {};
            switch (this.tile.type) {
            case "GrassTile":
                entry = imgmap.filter(
                obj => obj.name == "grasstile_" + this.tile.orientation[0] + ".png"
                )[0];
                break;
            case "MountainTile":
                entry = imgmap.filter(
                obj => obj.name == "mountaintile_" + this.tile.orientation[0] + ".png"
                )[0];
                break;
            case "ForestTile":
                entry = imgmap.filter(
                obj => obj.name == "foresttile_" + this.tile.orientation[0] + ".png"
                )[0];
                break;
            case "PumpkinResourceTile":
                entry = imgmap.filter(
                obj =>
                    obj.name ==
                    "pumpkinresourcetile_" + this.tile.orientation[0] + ".png"
                )[0];
                break;
            case "QuarterEdgeTile":
                entry = imgmap.filter(
                    obj =>
                        obj.name == "quarteredgetile_" + this.tile.orientation[0] + ".png"
                    )[0];
                break;
            case "HalfEdgeTile":
                entry = imgmap.filter(
                    obj => obj.name == "halfedgetile_" + this.tile.orientation[0] + ".png"
                    )[0];
                break;
            case "TriQuarterEdgeTile":
                entry = imgmap.filter(
                    obj =>
                        obj.name ==
                        "triquarteredgetile_" + this.tile.orientation[0] + ".png"
                    )[0];
                break;
            }
            if (this.tile.building != undefined) {
                function pad(num, size) {
                    var s = "000000000" + num;
                    return s.substr(s.length - size);
                }
                var tilename =
                    this.tile.building.type.toLowerCase() +
                    "_" +
                    this.tile.orientation[0] +
                    "_level" +
                    pad(this.tile.building.level, 3) +
                    ".png";
                //console.log(tilename);
                entry = imgmap.filter(obj => obj.name == tilename)[0];
            }
            if (entry != undefined) {
                return {pos: entry.pos, size: entry.size};
            }
            else {
                console.error("tile not found - fallback");
                return {pos: { x: 0, y: 0 }, size: { x: 400, y: 600 }};
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