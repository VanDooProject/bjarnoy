<template>
    <div>
        <div v-for="entry in text">
            {{entry}} <br/>
        </div>
        <button @click=logout>logout</button>
    </div>    
</template>

<script>
    export default{
        data: function() {
            return {
                text: "",
            }
        },
        methods: {
            logout: function() {
                localStorage.removeItem("token");
                this.$router.push('/login');
            }
        },
        mounted() {
            this.axios
            .get(this.$config.RequestUriPrefix + '/api/v1/Profile/self/',
            {
                headers: {'Authorization': "bearer " + localStorage.token},
                // CORS cookie issue: https://github.com/axios/axios/issues/876
                withCredentials: true
            })
            .then(response => {
                this.text = ["Username: " + response.data.username,
                            "Email: " + response.data.email,
                            "Created: " + response.data._id.creationTime];
            })
            .catch(error => console.log(error));
        }
    }
</script>

<style>

</style>
