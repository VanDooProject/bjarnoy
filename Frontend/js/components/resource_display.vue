<template>
    <a>
        Wood: {{Math.floor(resources.resourcesStoredCurrently.wood)}} / {{resources.resourceStorageCapacity.wood}} (+{{resources.hourlyResourceProduction.wood}}/h)
        Stone: {{Math.floor(resources.resourcesStoredCurrently.stone)}} / {{resources.resourceStorageCapacity.stone}} (+{{resources.hourlyResourceProduction.stone}}/h)
        Iron: {{Math.floor(resources.resourcesStoredCurrently.iron)}} / {{resources.resourceStorageCapacity.iron}} (+{{resources.hourlyResourceProduction.iron}}/h)
        Gold: {{Math.floor(resources.resourcesStoredCurrently.gold)}} / {{resources.resourceStorageCapacity.gold}} (+{{resources.hourlyResourceProduction.gold}}/h)
    </a>
</template>

<script>
    export default {
        components:{
            
        },
        name: "ResourceDisplay",
        props:[],
        computed: {
            resources()
            {
                return this.$store.state.userResources;
            },
        },
        methods: {
            
        },
        mounted () {

        },
    }
</script>

<style>
</style>