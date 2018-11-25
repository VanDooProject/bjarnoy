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
                    autocomplete="email"
                    placeholder="Please enter your email"
                >
                </b-form-input>
            </b-form-group>
            <b-form-group label="Password"
                    label-for="password"
                    :state="passwordCorrectState&&passwordVerifiedState"
            >
                <b-form-input
                    id="password"
                    type="password"
                    v-model="form.password"
                    required
                    :state="passwordCorrectState"
                    autocomplete="new-password"
                    placeholder="Please enter a password"
                >
                </b-form-input>
                <b-form-input
                    type="password"
                    v-model="form.passwordVerify"
                    required
                    :state="passwordVerifiedState"
                    autocomplete="new-password"
                    placeholder="Please verify the password"
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
        Already have an account? Click <router-link to="/login">login</router-link> to login.   
    </div>
</template>

<script>
    export default {
        props: [],
        methods: {

        },
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
                this.form.passwordVerify = '';
                /* Trick to reset/clear native browser form validation state */
                this.show = false;
                this.$nextTick(() => { this.show = true });
            }
        },
        computed: {
            passwordCorrectState: function () {
                //TODO: add Password requirements
                return true;
            },
            passwordVerifiedState: function () {
                //TODO: figure out how to stop submit if not correct (like email field)
                return this.form.password == this.form.passwordVerify
            }
        },
        data: function () {
            return {
                form: {
                    email: "",
                    password: "",
                    passwordVerify: ""
                }
            }
        }
    }

    // https://forum.vuejs.org/t/debugging-vue-files-with-visual-studio-code/8022/5
    //# sourceURL=map_tile.vue
</script>

<style>

</style>