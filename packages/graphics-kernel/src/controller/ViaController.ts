
import { ViaModel } from '../model/pcb.js';

export class ViaController {
  constructor(private model: ViaModel) {}

  public setPosition(x: number, y: number): void {
    this.model.position = { x, y };
    this.model.updateTransform();
  }

  public setDrill(drill: number): void {
    this.model.drill = drill;
    this.model.updateTransform();
  }

  public setDiameter(diameter: number): void {
    this.model.diameter = diameter;
    this.model.updateTransform();
  }

  public setLayers(layers: string[]): void {
    this.model.layers = layers;
  }

  public setNetId(netId: string | undefined): void {
    this.model.netId = netId;
  }

  public getModel(): ViaModel {
    return this.model;
  }
}
