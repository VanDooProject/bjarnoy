<template>
    <g>
        <image 
            v-bind:width=width
            v-bind:height=height
            v-bind:x="xpos"
            v-bind:y="ypos"

            v-bind:xlink:href=imgsrc

            class="tileimg"
        ></image>
        <polygon 
            v-bind:points="points"
            style="fill-opacity:0"

            v-on:mouseenter="openToolTip"
            v-on:mouseleave="closeToolTip"

            v-on:click="openMenu"
        />
        <foreignObject
            v-if="showTT"

            v-bind:x="xpos -200 + width/2"
            v-bind:y="ypos-ttHeight + 200 * mapScale"
            width=400
            v-bind:height="ttHeight"
        >
            <div class="tiletooltip">
                Type: {{tile.type}} {{tile.orientation}} ({{tile.position.x}}/{{tile.position.y}}) 
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

            xFactor: Math.SQRT2 * 3/4, // 3/4 comes from the geometry of stacking Hexagons
            yFactor: Math.SQRT2 * 3/4 / Math.sqrt(3) // sqrt(3) is also from the geometry
                    * Math.cos((57.8) / 180 * Math.PI), // the angle is from the Graphics
        };
    },
    computed: {
        ttHeight () {
            var height = 46;     //Textsize + 2 * Padding + BorderRadius (.tiletooltip)
            if(this.tile.resource!=undefined)
            {
                height+=26;      //Textsize + Padding (.tiletooltip)
            }
            if(this.tile.building!=undefined)
            {
                height+=26       //Textsize + Padding (.tiletooltip)
            }
            return height;
        },
        points () { // the point list for the hexagon that is used for mouse (and touch) events
            //x is straight forward
            //for y I have to add 47% of the height (Measured from Graphics ratio between the space below the first horizontal line and the hight of the image) 
            //because the actual graphics start there
            var xOff = this.xpos;
            var yOff = this.ypos + this.height * 0.47;

            var yFac = Math.sqrt(3)/2 //From the geometry
                * Math.cos((57.8) / 180 * Math.PI); //From the graphics

            return (xOff + this.width/4)    + "," + (yOff)                          + " "
                +  (xOff + this.width*3/4)  + "," + (yOff)                          + " "
                +  (xOff + this.width)      + "," + (yOff + this.width/2 * yFac)    + " "
                +  (xOff + this.width*3/4)  + "," + (yOff + this.width   * yFac)    + " "
                +  (xOff + this.width/4)    + "," + (yOff + this.width   * yFac)    + " "
                +  (xOff)                   + "," + (yOff + this.width/2 * yFac)    + " ";
        },
        xpos() {
            return this.width // use the (current) width to scale the vetor
                * (
                    // Rotate Coordinate system 45° and get x value
                        this.tile.position.x * Math.cos(this.angle) - this.tile.position.y * Math.sin(this.angle)
                ) 
                // Adjustment Factor
                * this.xFactor  
                // Add Offsets
                + this.mapOffset.x * this.mapScale
                // move the Origin to the middle of the screen (Probably not needed when the game is further in development)
                + this.windowWidth / 2
                 // move reference point to center of image
                - this.width / 2 ;
        },
        ypos() {
            return this.width //use the (current) width to scale the vetor
                * (
                    //Rotate Coordinate system 45° and get y value
                    -this.tile.position.y * Math.cos(this.angle) - this.tile.position.x * Math.sin(this.angle)
                )
                // Adjustment Factor
                * this.yFactor
                // Add Offset
                + this.mapOffset.y * this.mapScale
                // move the Origin to the middle of the screen (Probably not needed when the game is further in development)
                + this.windowHeight / 2
                // move reference point to center of image
                - this.height / 2;
        },
        windowWidth() {
            return this.$store.state.windowWidth;
        },
        windowHeight() {
            return this.$store.state.windowHeight;
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
            //Hardcoded for testing
            if(this.tile.type == "water")
                return "images/hextiles/watertile_E.png";
            //return "images/hextiles/grasstile_E.png";

            let orientation = '';
            switch(this.tile.orientation) {
                case 'NorthEast' :
                    orientation = 'NE';
                    break;
                case 'East' :
                    orientation = 'E';
                    break;
                case 'SouthEast' :
                    orientation = 'SE';
                    break;
                case 'SouthWest' :
                    orientation = 'SW';
                    break;
                case 'West' :
                    orientation = 'W';
                    break;
                case 'NorthWest' :
                    orientation = 'NW';
                    break;
            }

            if(this.tile.building == undefined)
            {
                return "images/hextiles/" + this.tile.type.toLowerCase() + "_" + orientation + ".png";
            }
            else
            {
                return "images/hextiles/" + this.tile.building.type.toLowerCase() + "_" + orientation + "_level" + this.tile.building.level.toString().padStart(3,'0') + ".png";
            }
        }
    }
};

// https://forum.vuejs.org/t/debugging-vue-files-with-visual-studio-code/8022/5
//# sourceURL=map_tile.vue
</script>

<style>
.tileimg {
    pointer-events: none;
}
.tiletooltip {
    background: rgba(0, 0, 0, 0.75);
    color: white;
    padding: 10px;
    border-radius: 10px;
    z-index: 0;
    font-size: 16px;
    pointer-events: none;

    /* noselect  https://stackoverflow.com/questions/826782/how-to-disable-text-selection-highlighting*/
    -webkit-touch-callout: none; /* iOS Safari */
      -webkit-user-select: none; /* Safari */
       -khtml-user-select: none; /* Konqueror HTML */
         -moz-user-select: none; /* Firefox */
          -ms-user-select: none; /* Internet Explorer/Edge */
              user-select: none; /* Non-prefixed version, currently
                                    supported by Chrome and Opera */
}
</style>