import { Context, Scenes } from 'telegraf';
import { ExpenseInterface } from './expense.interface';

export interface SessionData extends Scenes.WizardSessionData {
  expense: Partial<ExpenseInterface>;
  __scenes?: Scenes.SceneSessionData;
}

export interface BotContext extends Context {
  session: any;
  scene: Scenes.SceneContextScene<BotContext, any>;
  wizard: Scenes.WizardContextWizard<BotContext>;
}
