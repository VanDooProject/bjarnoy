<template>
    <img
        src="/images/circle1.png" 
        v-bind:style="{
            top: pos.y - size/2 + 'px',
            left: pos.x - size/2 + 'px',
            width: size + 'px',
            height: size + 'px',
            zIndex: 50001
        }"
        v-on:click="onClickHandler"
        class="mapsubmenu"
    />
</template>

<script>
    export default {
        props:["submenu", "submenutotal", "submenulayer", 'onClickHandler'],
        data: function() {
            return {

            }
        },
        computed: {
            angle() {
                return (this.submenu * 2 * Math.PI / this.submenutotal);
                console.log(this.s);
            },
            pos() {
                return {x: Math.sin(this.angle)*this.submenulayer*100, y: Math.cos(this.angle)*this.submenulayer*100};
            },
            size() {
                return 75 / this.submenulayer;
            }
        },
        methods: {
            
        },
        mounted () {
            
        },
    }
</script>

<style>
.mapsubmenu {
    position: absolute;

    /*background-color: oldlace;*/
}
</style>