<template>
    <div id="header">
        <menu>
            <!-- use router-link component for navigation. -->
            <!-- specify the link by passing the `to` prop. -->
            <!-- `<router-link>` will be rendered as an `<a>` tag by default -->
            <router-link to="/map">Go to map</router-link>
            <router-link to="/user">Go to user profile</router-link>
        </menu>
    </div>
</template>

<script>
    export default {
        name: "GameHeader",
        props:[],
        computed: {
            
        },
        methods: {
            
        },
        mounted () {
            
        },
    }
</script>

<style>
#header, #header > menu {
    position: relative;
    display: block;
    padding: 0px;
    margin: 0px;
    left: 0;
    top: 0;
    right: 0;
    z-index: 100000;
    background-color: darkgoldenrod;
}
#header > menu > a {
    display: inline;
}
</style>