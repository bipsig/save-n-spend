import mongoose, { Document, Schema } from "mongoose";

export interface ICategory extends Document {
    userId: mongoose.Types.ObjectId,
    name: string,
    parent: mongoose.Types.ObjectId | null,
    kind: "expense" | "income"
    icon?: string,
    color?: string,
    isArchived: boolean

}

const CategorySchema = new Schema<ICategory>({
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true },
    parent: { type: Schema.Types.ObjectId, ref: "Category", default: null },
    kind: { type: String, enum: ["expense", "income" ], required: true },
    icon: { type: String },
    color: { type: String },
    isArchived: { type: Boolean, default: false }
}, {
    timestamps: true
});

CategorySchema.index({
    userId: 1,
    isArchived: 1
});

export default mongoose.model<ICategory>("Category", CategorySchema);