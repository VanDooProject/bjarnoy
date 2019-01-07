<template>
    <div
        class="queueitem"
    >
        {{entry.tile.building.type}} Level {{entry.tile.building.level}} Until: {{entry.endTime}}
    </div>
</template>

<script>
export default {
    props: ['entry'],
    components: {
        
    },
    data: function() {
        return {
            
        };
    },
    computed: {
        
    },
    methods: {
    
    },
    mounted() {
        
    }
};
</script>

<style>
.queueitem {
    display: block;
}
</style>
