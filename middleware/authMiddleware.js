const jwt=require("jsonwebtoken");


const protect=async(req,res,next)=>{
    const authHeader=req.headers.authorization;

    if(!authHeader || !authHeader.startsWith("Bearer")){
        return res.status(401).json({message:"unauthorzed access"});
    }
    try{
        const token=authHeader.split(" ")[1];
        const decoded=jwt.verify(token,process.env.JWT_SECRET);
        req.user=decoded;
        next();
    }
    catch(err){
        return res.status(401).json({message:"Invalid token"});
    }

};
module.exports=protect;