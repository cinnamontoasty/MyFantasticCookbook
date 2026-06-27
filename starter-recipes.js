// ============================================================
// STARTER RECIPES
// These three load automatically the very first time the app
// connects to a brand-new Firebase project. After that, this
// file is never read again -- everything lives in Firestore.
// You can safely ignore this file going forward.
// ============================================================

export const STARTER_RECIPES = [
  {
    id: "starter-turkey-pasta",
    title: "Ground Turkey & Tomato Pasta",
    description: "A quick weeknight pasta with a rich tomato sauce, sundried tomatoes for depth, and a hit of lemon at the end to brighten it up.",
    baseServings: 4,
    notes: "No pasta water needed since the sauce is already saucy enough — but if it looks too thick, splash in a little reserved pasta water. The frozen baguette would be great toasted with butter and garlic on the side.",
    ingredients: [
      { id: "0001", amount: "12", unit: "oz", name: "pasta" },
      { id: "0002", amount: "1", unit: "lb", name: "ground turkey" },
      { id: "0003", amount: "3", unit: "", name: "garlic cloves, minced" },
      { id: "0004", amount: "1", unit: "", name: "carrot, finely diced" },
      { id: "0005", amount: "28", unit: "oz", name: "canned tomatoes (crushed or diced)" },
      { id: "0006", amount: "3", unit: "tbsp", name: "sundried tomatoes, chopped" },
      { id: "0007", amount: "0.5", unit: "cup", name: "chicken broth" },
      { id: "0008", amount: "2", unit: "tbsp", name: "olive oil" },
      { id: "0009", amount: "1", unit: "tsp", name: "salt" },
      { id: "0010", amount: "0.5", unit: "tsp", name: "black pepper" },
      { id: "0011", amount: "1", unit: "tsp", name: "dried oregano or Italian seasoning" },
      { id: "0012", amount: "0.25", unit: "tsp", name: "red pepper flakes (optional)" },
      { id: "0013", amount: "0.5", unit: "", name: "lemon, juiced" }
    ],
    steps: [
      { title: "Boil pasta", content: "Bring a large pot of salted water to a boil. Cook {0001} until al dente according to package directions.", timerSeconds: 600 },
      { title: "Brown the turkey", content: "While pasta cooks, heat {0008} in a large skillet over medium-high heat. Add {0002} and cook, breaking it up, until browned, about 5-6 minutes.", timerSeconds: 360 },
      { title: "Sauté aromatics", content: "Add {0003} and {0004} to the skillet. Cook for 2-3 minutes until fragrant and the carrot softens slightly.", timerSeconds: 180 },
      { title: "Build the sauce", content: "Stir in {0005}, {0006}, {0007}, {0009}, {0010}, {0011}, and {0012}. Bring to a simmer and cook, stirring occasionally, until slightly thickened.", timerSeconds: 600 },
      { title: "Finish and serve", content: "Stir in {0013}. Toss the cooked pasta directly into the sauce, or serve the sauce over the pasta. Taste and adjust salt and pepper.", timerSeconds: 0 }
    ]
  },
  {
    id: "starter-lime-meatballs",
    title: "Lime Turkey Meatballs in Tomato Sauce",
    description: "Garlicky turkey meatballs brightened with lime zest and juice, simmered in a simple tomato sauce with sundried tomatoes. A fresh twist on the classic.",
    baseServings: 4,
    notes: "Serve over pasta, in tortillas as a meatball taco, or just with toasted baguette for dipping. The lime zest in the meatballs is what really makes them different from standard Italian meatballs, so don't skip it. If the mix feels too wet to form, that's normal for turkey — wet hands help, or chill the mix for 10 minutes first.",
    ingredients: [
      { id: "0001", amount: "1", unit: "lb", name: "ground turkey" },
      { id: "0002", amount: "3", unit: "", name: "garlic cloves, minced" },
      { id: "0003", amount: "1", unit: "", name: "lime, zested and juiced" },
      { id: "0004", amount: "0.5", unit: "tsp", name: "salt" },
      { id: "0005", amount: "0.25", unit: "tsp", name: "black pepper" },
      { id: "0006", amount: "1", unit: "tsp", name: "ground cumin" },
      { id: "0007", amount: "0.5", unit: "tsp", name: "smoked paprika or chili powder" },
      { id: "0008", amount: "2", unit: "tbsp", name: "olive oil" },
      { id: "0009", amount: "1", unit: "", name: "carrot, finely diced" },
      { id: "0010", amount: "28", unit: "oz", name: "canned tomatoes (crushed or diced)" },
      { id: "0011", amount: "3", unit: "tbsp", name: "sundried tomatoes, chopped" },
      { id: "0012", amount: "0.5", unit: "cup", name: "chicken broth" },
      { id: "0013", amount: "0.25", unit: "cup", name: "fresh cilantro, chopped (optional, for serving)" }
    ],
    steps: [
      { title: "Mix and shape meatballs", content: "In a bowl, combine {0001}, {0002}, the zest from {0003}, {0004}, {0005}, {0006}, and {0007}. Mix gently until just combined (don't overmix). Form into 16-18 meatballs (about 1.5 tbsp each).", timerSeconds: 0 },
      { title: "Brown the meatballs", content: "Heat {0008} in a large skillet over medium-high heat. Sear the meatballs in batches, turning occasionally, until browned on all sides, about 5-6 minutes. They don't need to be cooked through yet — they'll finish in the sauce. Remove and set aside.", timerSeconds: 360 },
      { title: "Soften carrot", content: "In the same skillet, add {0009} and cook for 2 minutes until starting to soften.", timerSeconds: 120 },
      { title: "Build the sauce", content: "Stir in {0010}, {0011}, and {0012}. Bring to a simmer.", timerSeconds: 0 },
      { title: "Simmer meatballs in sauce", content: "Return the meatballs to the skillet, nestling them into the sauce. Cover and simmer until the meatballs are cooked through and the sauce has thickened slightly.", timerSeconds: 720 },
      { title: "Finish with lime", content: "Stir in the lime juice from {0003}. Taste and adjust salt. Top with {0013} if using, and serve.", timerSeconds: 0 }
    ]
  },
  {
    id: "starter-baked-salmon",
    title: "Baked Soy Butter Salmon with Potatoes & Peas",
    description: "Salmon baked in a foil packet with a soy butter sauce that steams it gently and pools into its own sauce. Served with boiled baby potatoes and peas.",
    baseServings: 2,
    notes: "The foil packet is the key step — it keeps everything moist and concentrates the soy butter into a little pool of sauce around the fish, and cleanup is basically nothing. If using sprouted baby potatoes, cut sprouts off generously along with a bit of the surrounding flesh; skip any that are soft, shriveled, or green-tinged.",
    ingredients: [
      { id: "0001", amount: "2", unit: "", name: "salmon fillets" },
      { id: "0002", amount: "2", unit: "tbsp", name: "butter" },
      { id: "0003", amount: "2", unit: "tbsp", name: "soy sauce" },
      { id: "0004", amount: "12", unit: "", name: "baby potatoes" },
      { id: "0005", amount: "1", unit: "cup", name: "frozen peas" },
      { id: "0006", amount: "1", unit: "", name: "lemon (optional, for serving)" }
    ],
    steps: [
      { title: "Preheat oven", content: "Preheat your oven to 400°F (200°C).", timerSeconds: 0 },
      { title: "Boil potatoes", content: "Boil {0004} in salted water until just tender, about 15 minutes.", timerSeconds: 900 },
      { title: "Make the soy butter", content: "Melt {0002} and mix it with {0003}.", timerSeconds: 0 },
      { title: "Assemble the foil packet", content: "Place {0001} on a piece of foil on a baking tray. Pour the soy butter mixture over the salmon, then fold the foil up loosely around it to make a sealed packet.", timerSeconds: 0 },
      { title: "Bake the salmon", content: "Bake for 12-15 minutes depending on thickness, until it flakes easily.", timerSeconds: 780 },
      { title: "Cook the peas", content: "Boil or microwave {0005} for 2-3 minutes until tender.", timerSeconds: 150 },
      { title: "Serve", content: "Plate the salmon with its sauce, the potatoes, and the peas. Squeeze {0006} over the top if using.", timerSeconds: 0 }
    ]
  }
];
