import mongoose, { Document, Schema } from "mongoose";

export interface ICategory extends Document {
    userId: mongoose.Types.ObjectId,
    name: string,
    parent: mongoose.Types.ObjectId | null,
    kind: "expense" | "income"
    icon?: string,
    color?: string,
    isArchived: boolean,
    /**
     * Where this sits among its SIBLINGS — top-level within a kind, or children under one
     * parent. Only ever compared inside such a set, so two categories in different sets
     * sharing a number means nothing. 0 for everything until the user reorders, which is
     * why the list endpoint breaks ties on `createdAt`.
     */
    order: number
}

const CategorySchema = new Schema<ICategory>({
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true },
    parent: { type: Schema.Types.ObjectId, ref: "Category", default: null },
    kind: { type: String, enum: ["expense", "income" ], required: true },
    icon: { type: String },
    color: { type: String },
    isArchived: { type: Boolean, default: false },
    order: { type: Number, default: 0 }
}, {
    timestamps: true
});

CategorySchema.index({
    userId: 1,
    isArchived: 1
});

export default mongoose.model<ICategory>("Category", CategorySchema);