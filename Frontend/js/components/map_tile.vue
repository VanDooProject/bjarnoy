<template>
  <div
    class="tile"
    v-on:click="openMenu"
    v-on:mouseenter="openToolTip"
    v-on:mouseleave="closeToolTip"
    v-bind:style="{
            position: 'absolute',
            transform: 'translate(' + tile.position.y * -141 * imgSize.x/200 + 'px, ' + tile.position.x * 141 * imgSize.x/200 + 'px)',
            width:  141 * imgSize.x/200 + 'px',
            height: 141 * imgSize.x/200 + 'px',
            zIndex: tile.position.x - tile.position.y
        }"
  >
    <div
      v-bind:style="{
                zIndex: tile.position.x - tile.position.y,
                /* ATTENTION: x and y are swapped */
                backgroundPositionX: - imgPos.y + 'px',
                backgroundPositionY: - imgPos.x + 'px',
                width: imgSize.x + 'px',
                height: imgSize.y + 'px'
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
    openMenu: function(event) {
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
    openToolTip: function() {
      this.showTT = true;
    },
    closeToolTip: function() {
      this.showTT = false;
    }
  },
  data: function() {
    return {
      showTT: false,
      imgPos: { x: 0, y: 0 },
      imgSize: { x: 300, y: 200 }
    };
  },
  computed: {},
  mounted() {
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

      default:
        entry.pos = { x: 600, y: 600 };
        entry.size = { x: 200, y: 300 };
    }

    this.imgPos = entry.pos;
    this.imgSize = entry.size;
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
  transform: translate(-100px, -150px) rotateZ(-45deg) scaleY(2.38);
  pointer-events: none;
}
.tiletooltip {
  background: rgba(0, 0, 0, 0.75);
  color: white;
  transform: rotateZ(-45deg) scaleY(2);
  position: absolute;
  width: 400px;
  bottom: 200px;
  right: 0px;
  padding: 10px;
  border-radius: 10px;
  z-index: -10000;
}
</style>