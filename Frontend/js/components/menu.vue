<template>
    <div 
        v-bind:style="{
            top: pos.y - size.y/2 + 'px',
            left: pos.x - size.x/2 + 'px',
            width: size.x + 'px',
            height: size.y + 'px',

            zIndex: 50000
        }"      
        class="mapmenu">    
            pos = ( {{pos.x}} | {{ pos.y }} )
    </div>
</template>

<script>
export default {
    props:['pos'],
    data: function() {
        return {
            size: {x:150, y:150}
        }
    },
    mounted () {
        console.log("menu mounted");
    },
}
</script>

<style>
.mapmenu {
    display: block;

    position: absolute;

    background-color: oldlace;
}
.mapmenu:hover {
    background-color: lightblue;
}
</style>