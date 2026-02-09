
    async function loadUserProfile(){
        const token=localStorage.getItem('token');
        if(!token) return ;
        const res=await fetch('/api/user/profile',{
            headers:{
                'Authorization':`Bearer ${token}`
            }
        });
        if(!res.ok) return ;
        const data=await res.json();
        console.log(data);
        document.querySelector('.profile-name').textContent=data.name;
        document.querySelector('.profile-role').textContent='ExpenseFlow User';
        document.getElementById('profile-email').textContent=data.email;
        document.getElementById('profile-created').textContent = new Date(data.createdAt).toLocaleString();

    }
    document.addEventListener('DOMContentLoaded',loadUserProfile);
