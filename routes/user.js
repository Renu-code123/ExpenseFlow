const express=require("express");
const router=express.Router();
const User=require("../models/User");
const protect=require("../middleware/authMiddleware");

// Get user profile
router.get("/profile",protect,async(req,res)=>{
    try{
        const user=await User.findById(req.user.id).select("-password");
        if(!user){
            return res.status(404).json({message:"User not found"});
        }
        res.json({
            name:user.name,
            email:user.email,
            createdAt:user.createdAt
        });
    }
    catch(err){
        console.error(err);
        res.status(500).json({message:"Server error"});
    }
});

module.exports=router;