<template>
    <div>
        <b-form @submit="onSubmit" @reset="onReset">
            <b-form-group label="Email"
                    label-for="email" 
                    description="We'll never share your email with anyone else."
            >
                <b-form-input
                    id="email"
                    type="email"
                    v-model="form.email"
                    required
                    placeholder="Enter username or email"
                >
                </b-form-input>
            </b-form-group>
            <b-form-group label="Password"
                    label-for="password" 
            >
                <b-form-input
                    id="password"
                    type="password"
                    v-model="form.password"
                    required
                    placeholder="Please enter your password"
                    autocomplete="current-password"
                >
                </b-form-input>
            </b-form-group>
            <b-form-group>
                <b-form-checkbox id="staylogedin" v-model="form.stayLogedIn">
                    Stay logged in?
                </b-form-checkbox>
            </b-form-group>
            <b-form-group>
                <b-button type="submit" variant="primary">Submit</b-button>
                <b-button type="reset"  variant="danger" >Reset</b-button>
            </b-form-group>
        </b-form>                
    </div>
</template>

<script>
    export default {
        props: [],
        methods: {
            onSubmit (evt) {
                evt.preventDefault();
                //TODO: Send to Backend
                alert(JSON.stringify(this.form));
            },
            onReset (evt) {
                evt.preventDefault();
                /* Reset our form values */
                this.form.email = '';
                this.form.password = '';
                /* Trick to reset/clear native browser form validation state */
                this.show = false;
                this.$nextTick(() => { this.show = true });
            }
        },
        data: function () {
            return {
                form:{
                    email: "",
                    password: "",
                    stayLogedIn: false
                }
            }
        }
    }

    // https://forum.vuejs.org/t/debugging-vue-files-with-visual-studio-code/8022/5
    //# sourceURL=map_tile.vue
</script>

<style>

</style>