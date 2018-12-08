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
        components:{
            
        },
        name: "GameHeader",
        props:[],
        computed: {
            
        },
        methods: {
            //https://stackoverflow.com/questions/38552003/how-to-decode-jwt-token-in-javascript
            jwtDecode(token){
                return JSON.parse(
                    decodeURIComponent(
                    Array.prototype.map.call(atob(
                    token.split('.')[1].replace('-', '+').replace('_', '/')
                    ), c =>
                    '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
                    ).join(''))
                )
            }
        },
        mounted () {
            if (localStorage.token == undefined)
            {
                this.$router.push('/register');
            }
            else
            {
                var date = new Date();
                var now = Math.round(date.getTime()/1000);
                var expires = this.jwtDecode(localStorage.token).exp;
                var notBefore = this.jwtDecode(localStorage.token).nbf;
                if((expires - now) > ((expires - notBefore) / 2))
                {
                    this.axios
                    .get(this.$config.RequestUriPrefix + '/api/v1/auth/selftest',
                    {
                        headers: {'Authorization': "bearer " + localStorage.token},
                        // CORS cookie issue: https://github.com/axios/axios/issues/876
                        withCredentials: true
                    })
                    .then(response => {})
                    .catch(error => this.$router.push('/login'));
                }
                else if ((expires - now) > 0)
                {
                    this.axios
                    .get(this.$config.RequestUriPrefix + '/api/v1/auth/refresh',
                    {
                        headers: {'Authorization': "bearer " + localStorage.token},
                        // CORS cookie issue: https://github.com/axios/axios/issues/876
                        withCredentials: true
                    })
                    .then(response => localStorage.token = response.data.token)
                    .catch(error => this.$router.push('/login'));
                }
                else
                {
                    this.$router.push('/login');
                }
            }
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