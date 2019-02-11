<template>
    <g
        v-on:mouseenter="openToolTip"
        v-on:mouseleave="closeToolTip"
    >
        <image 
            v-bind:width=width
            v-bind:height=height
            v-bind:x="xpos"
            v-bind:y="ypos"

            v-bind:xlink:href=imgsrc
            v-on:click="openMenu"
        ></image>
        <foreignObject
            v-bind:x="xpos"
            v-bind:y="ypos-100"
            v-if="showTT"
            width=400
            height=100
        >
            <div class="tiletooltip">
                Type: {{tile.type}} ({{tile.position.x}}/{{tile.position.y}})
                <div v-if="tile.resource!=undefined">
                    Resource: {{tile.resource.type}} Volume: {{tile.resource.resourceVolume}} Rate:{{tile.resource.degradationRate}}
                </div>
                <div v-if="tile.building!=undefined">
                    Building: {{tile.building.type}} Level {{tile.building.level}}
                </div>
            </div>
        </foreignObject>
    </g>
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
            imgWidth: 400,
            imgHeight: 600,
            angle: -45 * Math.PI / 180,
        };
    },
    computed: {
        xpos() {
            return this.width * (
                    this.tile.position.x * Math.cos(this.angle) - this.tile.position.y * Math.sin(this.angle)
            ) / Math.SQRT2 + this.mapOffset.x * this.mapScale + 500;  
        },
        ypos() {
            return this.width * (
                    -this.tile.position.y * Math.cos(this.angle) - this.tile.position.x * Math.sin(this.angle)
            ) /Math.SQRT2 * Math.cos(65 / 180 * Math.PI) + this.mapOffset.y * this.mapScale + 500;
        },
        width() {
            return this.imgWidth * this.mapScale;
        },
        height() {
            return this.imgHeight * this.mapScale;
        },
        mapScale() {
            return this.$store.state.mapScale;
        },
        mapOffset() {
            return this.$store.state.mapOffset;
        },
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
    padding: 10px;
    border-radius: 10px;
    z-index: 0;
    font-size: 16px;
}
</style>