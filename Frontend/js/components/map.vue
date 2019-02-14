<template>
    <div>
        <MapMenu></MapMenu>
        <queue></queue>

        <svg 
        id="map"
        v-on:mouseup='mouseUp'
        v-on:mousemove='mouseMove'
        v-on:mouseleave='mouseLeave'
        v-on:mousedown='mouseDown'
        v-on:wheel='wheelMove'

        v-on:touchend='touchUp'
        v-on:touchmove='touchMove'
        v-on:touchleave='touchLeave'
        v-on:touchcancel='touchLeave'
        v-on:touchstart='touchDown'
        >
            <g><MapTile v-bind:key=tile._id v-bind:tile=tile v-for="tile in tiles"/></g>
            <ZoomButtons/>
        </svg>
    </div>
</template>

<script>
    import MapTile from './map_tile.vue';
    import MapMenu from './menu.vue';
    import Queue from './queue.vue';
    import ZoomButtons from './zoom_buttons.vue';
    
    export default {
        components: {
            MapTile,
            MapMenu,
            Queue,
            ZoomButtons,
        },
        props: [],
        data: function() {
            return {
                // will be a three-dimensional array with map coords
                isMouseDown: false,
                mouseMoved: false,
                moveX: 0,
                moveY: 0,
                touchLastPos: {x: 0, y:0}
            }
        },
        computed: {
            tiles() { 
                return this.$store.state.mapTiles;
            },
            TilesArray () {
                var ls = [[]];
                this.tiles.forEach(tile => {
                    var zLayer = Math.round(tile.position.z);
                    if(ls[zLayer] == undefined)
                    {
                        ls[zLayer]=[];
                    }
                    ls[zLayer].push(tile);
                });
                return ls;
            },
            mapScale() {
                return this.$store.state.mapScale;
            },
        },
        mounted () {
            this.$store.dispatch("UpdateMapTiles");
            window.requestAnimationFrame(this.animationCallback);
        },
        methods: {
            animationCallback: function (timestamp) {
                requestAnimationFrame(this.animationCallback);
                if(this.mouseMoved)
                {
                    this.$store.commit("MouseMove", {x: this.moveX / this.mapScale, y: this.moveY / this.mapScale});
                    this.moveX = 0;
                    this.moveY = 0;
                    this.mouseMoved = false;
                }
            },
            //Mousewheel Event
            wheelMove: function (event) {
                this.$store.commit("SetMenuVisible",false);
                this.$store.commit("AddMapScale", -this.$store.state.mapScale * event.deltaY /1000);
            },
            //Mouse Events
            mouseDown: function(event) {
                this.isMouseDown = true;
                this.$store.commit("ClearMouseMove");
                if(this.$store.state.menuVisible == true)
                {
                    this.$store.commit("SetMenuVisible", false);
                    this.$store.commit("SetMenuClosed", true);
                }
            },
            mouseUp: function(event) {
                this.isMouseDown = false;
            },
            mouseMove: function(event) {
                if(this.isMouseDown)
                {
                    this.mouseMoved = true;
                    this.moveX += event.movementX;
                    this.moveY += event.movementY;
                }
            },
            mouseLeave: function(event) {
                this.isMouseDown = false;
            },
            //Touch Events
            touchDown: function(event) {
                this.isMouseDown = true;
                this.$store.commit("ClearMouseMove");
                if(this.$store.state.menuVisible == true)
                {
                    this.$store.commit("SetMenuVisible", false);
                    this.$store.commit("SetMenuClosed", true);
                }
                this.touchLastPos.x = event.changedTouches[0].clientX;
                this.touchLastPos.y = event.changedTouches[0].clientY;
            },
            touchUp: function(event) {
                this.isMouseDown = false;
            },
            touchLeave: function(event) {
                this.isMouseDown = false;
            },
            touchMove: function(event) { 
                if(this.isMouseDown)
                {
                    this.mouseMoved = true;
                    this.moveX += event.changedTouches[0].clientX - this.touchLastPos.x;
                    this.moveY += event.changedTouches[0].clientY - this.touchLastPos.y;
                }
                this.touchLastPos.x = event.changedTouches[0].clientX;
                this.touchLastPos.y = event.changedTouches[0].clientY;
            }
        }
    }

    // https://forum.vuejs.org/t/debugging-vue-files-with-visual-studio-code/8022/5
    //# sourceURL=map.vue
</script>

<style>
html, body {
    padding: 0px;
    margin: 0px;

    width: 100%;
    height: 100%;
    overflow: hidden;
}

#map {
    padding: 0px;
    margin: 0px;
    position: absolute;
    top:0;
    left:0;
    width:100%;
    height: 100%;
}
</style>